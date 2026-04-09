import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  useListMenuCategories,
  useListMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import type {
  MenuCategory,
  MenuItem,
  CreateMenuItemBody,
  UpdateMenuItemBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  UtensilsCrossed,
  QrCode,
  Printer,
  ExternalLink,
  UploadCloud,
  ImageIcon,
  Expand,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { buildMenuItemScanLink, buildQrImageUrl, openQrPrintWindow } from "@/lib/qr-links";
import { resolveMenuImageUrl } from "@/lib/menu-image";

const STATION_OPTIONS = ["salad", "tea-coffee", "juice", "kitchen"] as const;

type StationCode = (typeof STATION_OPTIONS)[number];
type StationFilter = "all" | StationCode;
type MenuViewMode = "table" | "cards" | "thumbnails";

const MENU_VIEW_STORAGE_KEY = "teahouse_menu_view_mode";
const MENU_VIEW_OPTIONS: Array<{ value: MenuViewMode; labelKey: string }> = [
  { value: "table", labelKey: "menu.viewMode.table" },
  { value: "cards", labelKey: "menu.viewMode.cards" },
  { value: "thumbnails", labelKey: "menu.viewMode.thumbnails" },
];

const MYANMAR_TEXT_REGEX = /[\u1000-\u109f]/;

const CATEGORY_MM_FALLBACK: Record<string, string> = {
  "Tea & Coffee": "လက်ဖက်ရည်နှင့်ကော်ဖီ",
  Noodles: "ခေါက်ဆွဲမျိုးစုံ",
  "Rice Dishes": "ထမင်းပွဲများ",
  Snacks: "အဆာပြေ",
  Desserts: "အချိုပွဲများ",
};

const ITEM_MM_FALLBACK: Record<string, string> = {
  "Myanmar Milk Tea": "မြန်မာလက်ဖက်ရည်ဆိမ့်",
  "Black Coffee": "ကော်ဖီအမည်း",
  "Iced Lemon Tea": "သံပုရာလက်ဖက်ရည်အေး",
  "Shan Noodle": "ရှမ်းခေါက်ဆွဲ",
  Mohinga: "မုန့်ဟင်းခါး",
  "Nan Gyi Thoke": "နန်းကြီးသုပ်",
  "Fried Rice (Chicken)": "ကြက်သားထမင်းကြော်",
  "Steamed Rice + Pork Curry": "ဝက်သားဟင်းနှင့် ထမင်း",
  Samosa: "ဆမူဆာ",
  "Spring Roll": "စပရင်းရိုး",
  "Coconut Jelly": "အုန်းနို့ကျောက်ကျော",
  "Sticky Rice with Mango": "သရက်သီးကောက်ညှင်း",
};

function hasMyanmarText(value?: string | null): boolean {
  return Boolean(value && MYANMAR_TEXT_REGEX.test(value));
}

function resolveMyanmarLabel(englishName: string, myanmarValue: string | undefined, fallbackMap: Record<string, string>): string {
  if (hasMyanmarText(myanmarValue)) return myanmarValue as string;
  if (fallbackMap[englishName]) return fallbackMap[englishName];
  if (myanmarValue && myanmarValue.trim().length > 0) return myanmarValue;
  return englishName;
}

type MenuItemMetadata = {
  weightGrams?: number;
  calories?: number;
  ingredients?: string;
  discountPrice?: string;
};

type CustomizationPayload = {
  meta?: MenuItemMetadata;
  [key: string]: unknown;
};

function parseCustomizationPayload(raw: string | null | undefined): CustomizationPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CustomizationPayload;
    }
  } catch {
    // Ignore malformed JSON and return empty payload.
  }
  return {};
}

function normalizeGoogleDriveImageUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.hostname.includes("drive.google.com")) {
      const openId = url.searchParams.get("id");
      if (openId) return `https://drive.google.com/uc?export=view&id=${openId}`;

      const matched = url.pathname.match(/\/file\/d\/([^/]+)/);
      if (matched?.[1]) return `https://drive.google.com/uc?export=view&id=${matched[1]}`;
    }
  } catch {
    return raw;
  }

  return raw;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:")) {
        reject(new Error("Invalid image file."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to process image."));
    image.src = src;
  });
}

async function optimizeImageToDataUrl(file: File): Promise<string> {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const maxSide = 1200;
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
  const targetWidth = Math.max(1, Math.round(originalWidth * scale));
  const targetHeight = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return originalDataUrl;
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const optimized = canvas.toDataURL("image/jpeg", 0.82);
  return optimized.length < originalDataUrl.length ? optimized : originalDataUrl;
}

function getItemMetadata(item: Pick<MenuItem, "customizationOptions">): MenuItemMetadata {
  const payload = parseCustomizationPayload(item.customizationOptions);
  if (payload.meta && typeof payload.meta === "object") {
    return payload.meta;
  }
  return {};
}

type ItemFormState = {
  name: string;
  nameMyanmar: string;
  categoryId: string;
  station: StationCode;
  price: string;
  discountPrice: string;
  description: string;
  imageUrl: string;
  weightGrams: string;
  calories: string;
  ingredients: string;
  available: boolean;
};

function getStationLabel(station: StationCode, t: (key: string) => string): string {
  return t(`station.${station}`);
}

function buildInitialItemForm(item: MenuItem | undefined, categories: MenuCategory[]): ItemFormState {
  const meta = item ? getItemMetadata(item) : {};
  return {
    name: item?.name ?? "",
    nameMyanmar: item?.nameMyanmar ?? "",
    categoryId: String(item?.categoryId ?? categories[0]?.id ?? ""),
    station: item?.station ?? "kitchen",
    price: item?.price ?? "",
    discountPrice: meta.discountPrice ?? "",
    description: item?.description ?? "",
    imageUrl: item?.imageUrl ?? "",
    weightGrams: meta.weightGrams != null ? String(meta.weightGrams) : "",
    calories: meta.calories != null ? String(meta.calories) : "",
    ingredients: meta.ingredients ?? "",
    available: item ? item.available !== "false" && item.available !== "0" : true,
  };
}

function getCardGridClass(viewMode: MenuViewMode): string {
  if (viewMode === "thumbnails") {
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
  }
  return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
}

function ItemDialog({
  open,
  item,
  categories,
  saving,
  onUploadImage,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  item?: MenuItem;
  categories: MenuCategory[];
  saving: boolean;
  onUploadImage: (file: File) => Promise<string>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateMenuItemBody | UpdateMenuItemBody) => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isMyanmar = i18n.resolvedLanguage === "mm";
  const [form, setForm] = useState<ItemFormState>(() => buildInitialItemForm(item, categories));
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialItemForm(item, categories));
  }, [open, item, categories]);

  const valid =
    form.name.trim().length > 0 &&
    form.price.trim().length > 0 &&
    form.categoryId.trim().length > 0 &&
    form.station.trim().length > 0;

  const handleSubmit = () => {
    const currentPayload = item ? parseCustomizationPayload(item.customizationOptions) : {};
    const nextMeta: MenuItemMetadata = {};

    if (form.weightGrams.trim().length > 0) {
      const parsedWeight = Number(form.weightGrams);
      if (Number.isFinite(parsedWeight)) nextMeta.weightGrams = parsedWeight;
    }
    if (form.calories.trim().length > 0) {
      const parsedCalories = Number(form.calories);
      if (Number.isFinite(parsedCalories)) nextMeta.calories = parsedCalories;
    }
    if (form.ingredients.trim().length > 0) nextMeta.ingredients = form.ingredients.trim();
    if (form.discountPrice.trim().length > 0) nextMeta.discountPrice = form.discountPrice.trim();

    const mergedPayload: CustomizationPayload = {
      ...currentPayload,
      meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
    };

    if (mergedPayload.meta == null) {
      delete mergedPayload.meta;
    }

    const customizationOptions =
      Object.keys(mergedPayload).length > 0 ? JSON.stringify(mergedPayload) : undefined;

    const payload = {
      name: form.name.trim(),
      nameMyanmar: form.nameMyanmar.trim() || form.name.trim(),
      categoryId: Number(form.categoryId),
      station: form.station,
      price: form.price.trim(),
      description: form.description.trim() || undefined,
      imageUrl: normalizeGoogleDriveImageUrl(form.imageUrl) || undefined,
      customizationOptions,
      available: form.available ? "true" : "false",
    };
    onSubmit(payload);
  };

  const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setUploadingImage(true);
    try {
      const imageUrl = await onUploadImage(file);
      setForm((prev) => ({ ...prev, imageUrl }));
    } catch (error) {
      toast({
        title: t("menu.uploadFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? t("menu.editTitle") : t("menu.addTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("menu.itemName")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("menu.itemNamePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("menu.itemNameMm")}</Label>
              <Input
                value={form.nameMyanmar}
                onChange={(e) => setForm((prev) => ({ ...prev, nameMyanmar: e.target.value }))}
                placeholder={t("menu.itemNameMmPlaceholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t("menu.priceMmk")}</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="2500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("menu.station")}</Label>
              <Select
                value={form.station}
                onValueChange={(value) => setForm((prev) => ({ ...prev, station: value as StationCode }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("menu.selectStation")} />
                </SelectTrigger>
                <SelectContent>
                  {STATION_OPTIONS.map((station) => (
                    <SelectItem key={station} value={station}>
                      {getStationLabel(station, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("menu.category")}</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("menu.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {isMyanmar
                        ? resolveMyanmarLabel(category.name, category.nameMyanmar, CATEGORY_MM_FALLBACK)
                        : category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("menu.descriptionOptional")}</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t("menu.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("menu.imageUrlOptional")}</Label>
            <div className="space-y-2">
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://drive.google.com/file/d/..."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="menu-image-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {t("menu.uploadImage")}
                </Label>
                <input
                  id="menu-image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadImage}
                  disabled={uploadingImage}
                />
                <span className="text-xs text-muted-foreground">{t("menu.uploadHint")}</span>
              </div>
              {form.imageUrl.trim().length > 0 ? (
                <div className="overflow-hidden rounded-md border bg-muted/20 p-1">
                  <img
                    src={resolveMenuImageUrl(normalizeGoogleDriveImageUrl(form.imageUrl))}
                    alt="Menu preview"
                    className="h-28 w-28 rounded object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>{t("menu.discountPriceOptional")}</Label>
              <Input
                type="number"
                min={0}
                value={form.discountPrice}
                onChange={(e) => setForm((prev) => ({ ...prev, discountPrice: e.target.value }))}
                placeholder="2000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("menu.weightGramsOptional")}</Label>
              <Input
                type="number"
                min={0}
                value={form.weightGrams}
                onChange={(e) => setForm((prev) => ({ ...prev, weightGrams: e.target.value }))}
                placeholder="250"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("menu.caloriesOptional")}</Label>
              <Input
                type="number"
                min={0}
                value={form.calories}
                onChange={(e) => setForm((prev) => ({ ...prev, calories: e.target.value }))}
                placeholder="320"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("menu.ingredientsOptional")}</Label>
              <Input
                value={form.ingredients}
                onChange={(e) => setForm((prev) => ({ ...prev, ingredients: e.target.value }))}
                placeholder={t("menu.ingredientsPlaceholder")}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border px-3 py-2">
            <Switch
              id="item-available"
              checked={form.available}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, available: checked }))}
            />
            <Label htmlFor="item-available">{form.available ? t("menu.available") : t("menu.unavailable")}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {item ? t("common.saveChanges") : t("actions.addItem")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MenuPage() {
  const { t, i18n } = useTranslation();
  const isMyanmar = i18n.resolvedLanguage === "mm";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: categories = [], isLoading: categoriesLoading } = useListMenuCategories({
    query: { queryKey: getListMenuCategoriesQueryKey() },
  });

  const { data: menuItems = [], isLoading: itemsLoading } = useListMenuItems(undefined, {
    query: { queryKey: getListMenuItemsQueryKey() },
  });

  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [viewMode, setViewMode] = useState<MenuViewMode>("table");
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: MenuItem }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [qrTarget, setQrTarget] = useState<MenuItem | null>(null);
  const [imagePreview, setImagePreview] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(MENU_VIEW_STORAGE_KEY);
    if (!raw) return;
    const allowed = MENU_VIEW_OPTIONS.some((option) => option.value === raw);
    if (allowed) {
      setViewMode(raw as MenuViewMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MENU_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const categoryById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  const filteredItems = useMemo(() => {
    if (stationFilter === "all") return menuItems;
    return menuItems.filter((item) => item.station === stationFilter);
  }, [menuItems, stationFilter]);

  const buildItemDisplay = (item: MenuItem) => {
    const available = item.available !== "false" && item.available !== "0";
    const category = categoryById.get(item.categoryId);
    const itemPrimaryName = isMyanmar
      ? resolveMyanmarLabel(item.name, item.nameMyanmar, ITEM_MM_FALLBACK)
      : item.name;
    const itemSecondaryName = isMyanmar
      ? item.name
      : resolveMyanmarLabel(item.name, item.nameMyanmar, ITEM_MM_FALLBACK);
    const categoryLabel = category
      ? (isMyanmar
          ? resolveMyanmarLabel(category.name, category.nameMyanmar, CATEGORY_MM_FALLBACK)
          : category.name)
      : t("menu.unknownCategory", { id: item.categoryId });
    const metadata = getItemMetadata(item);
    const discountPriceValue = metadata.discountPrice ? Number(metadata.discountPrice) : null;
    const hasValidDiscount =
      discountPriceValue != null &&
      Number.isFinite(discountPriceValue) &&
      discountPriceValue > 0 &&
      discountPriceValue < Number(item.price);
    const imageSrc = item.imageUrl?.trim() ? resolveMenuImageUrl(item.imageUrl) : "";
    return {
      available,
      categoryLabel,
      itemPrimaryName,
      itemSecondaryName,
      metadata,
      discountPriceValue,
      hasValidDiscount,
      imageSrc,
    };
  };

  const openItemPreview = (name: string, url: string) => {
    if (!url) return;
    setImagePreview({ name, url });
  };

  const menuQrLink = qrTarget ? buildMenuItemScanLink(qrTarget.id) : "";
  const menuQrImage = menuQrLink ? buildQrImageUrl(menuQrLink, 320) : "";

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: getListMenuItemsQueryKey() });
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    const optimizedDataUrl = await optimizeImageToDataUrl(file);
    if (optimizedDataUrl.length > 2_000_000) {
      throw new Error("Image is too large. Please choose a smaller image.");
    }
    toast({ title: t("menu.uploadSuccess") });
    return optimizedDataUrl;
  };

  const handleSaveItem = async (payload: CreateMenuItemBody | UpdateMenuItemBody) => {
    try {
      if (itemDialog.item) {
        await updateItem.mutateAsync({
          id: itemDialog.item.id,
          data: payload as UpdateMenuItemBody,
        });
        toast({ title: t("menu.toastUpdated") });
      } else {
        await createItem.mutateAsync({ data: payload as CreateMenuItemBody });
        toast({ title: t("menu.toastAdded") });
      }
      setItemDialog({ open: false });
      invalidateItems();
    } catch {
      toast({ title: t("menu.toastSaveFailed"), variant: "destructive" });
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem.mutateAsync({ id: deleteTarget.id });
      toast({ title: t("menu.toastDeleted") });
      setDeleteTarget(null);
      invalidateItems();
    } catch {
      toast({ title: t("menu.toastDeleteFailed"), variant: "destructive" });
    }
  };

  if (categoriesLoading || itemsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{t("menu.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("menu.itemsCount", { count: menuItems.length })}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={stationFilter} onValueChange={(value) => setStationFilter(value as StationFilter)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder={t("menu.filterStation")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("menu.allStations")}</SelectItem>
              {STATION_OPTIONS.map((station) => (
                <SelectItem key={station} value={station}>
                  {getStationLabel(station, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as MenuViewMode)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder={t("menu.viewMode.label")} />
            </SelectTrigger>
            <SelectContent>
              {MENU_VIEW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setItemDialog({ open: true })}
            disabled={categories.length === 0}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("menu.addNewItem")}
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <div className="text-center">
            <UtensilsCrossed className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>{t("menu.noCategory")}</p>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <div className="text-center">
            <UtensilsCrossed className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>{t("menu.noItemsForFilter")}</p>
          </div>
        </div>
      ) : viewMode === "table" ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableSettings.columns.id")}</TableHead>
                <TableHead>{t("orders.menuTable.photo")}</TableHead>
                <TableHead>{t("menu.itemName")}</TableHead>
                <TableHead>{t("menu.category")}</TableHead>
                <TableHead>{t("menu.station")}</TableHead>
                <TableHead className="text-right">{t("menu.price")}</TableHead>
                <TableHead>{t("menu.status")}</TableHead>
                <TableHead className="text-right">{t("tableSettings.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const display = buildItemDisplay(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">#{item.id}</TableCell>
                    <TableCell>
                      {display.imageSrc ? (
                        <button
                          type="button"
                          onClick={() => openItemPreview(display.itemPrimaryName, display.imageSrc)}
                          className="overflow-hidden rounded-md border"
                          title={t("menu.previewImage")}
                        >
                          <img
                            src={display.imageSrc}
                            alt={display.itemPrimaryName}
                            className="h-14 w-14 object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{display.itemPrimaryName}</div>
                      <div className="text-xs text-muted-foreground">{display.itemSecondaryName}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {display.metadata.weightGrams ? `${display.metadata.weightGrams}g` : ""}
                        {display.metadata.calories
                          ? `${display.metadata.weightGrams ? " · " : ""}${display.metadata.calories} kcal`
                          : ""}
                        {display.metadata.ingredients
                          ? `${display.metadata.weightGrams || display.metadata.calories ? " · " : ""}${display.metadata.ingredients}`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell>{display.categoryLabel}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getStationLabel(item.station, t)}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {display.hasValidDiscount ? (
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground line-through">
                            {Number(item.price).toLocaleString()} {t("menu.currencySuffix")}
                          </div>
                          <div className="text-emerald-700">
                            {display.discountPriceValue?.toLocaleString()} {t("menu.currencySuffix")}
                          </div>
                        </div>
                      ) : (
                        <span>
                          {Number(item.price).toLocaleString()} {t("menu.currencySuffix")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={display.available ? "secondary" : "outline"}>
                        {display.available ? t("menu.available") : t("menu.unavailable")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openItemPreview(display.itemPrimaryName, display.imageSrc)}
                          title={t("menu.previewImage")}
                          disabled={!display.imageSrc}
                        >
                          <Expand className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setQrTarget(item)}
                          title={t("menu.qr.openQr")}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setItemDialog({ open: true, item })}
                          title={t("menu.editItem")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(item)}
                          title={t("menu.deleteItem")}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className={`grid gap-4 ${getCardGridClass(viewMode)}`}>
          {filteredItems.map((item) => {
            const display = buildItemDisplay(item);
            return (
              <div key={item.id} className="overflow-hidden rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => openItemPreview(display.itemPrimaryName, display.imageSrc)}
                  className={`relative block w-full overflow-hidden border-b bg-muted/20 ${
                    viewMode === "thumbnails" ? "aspect-square" : "aspect-[16/10]"
                  }`}
                  disabled={!display.imageSrc}
                >
                  {display.imageSrc ? (
                    <img src={display.imageSrc} alt={display.itemPrimaryName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-1 text-xs">
                        <ImageIcon className="h-5 w-5" />
                        <span>{t("menu.noImage")}</span>
                      </div>
                    </div>
                  )}
                  {display.imageSrc ? (
                    <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
                      <Expand className="mr-1 h-3 w-3" />
                      {t("menu.previewImage")}
                    </span>
                  ) : null}
                </button>

                <div className={viewMode === "thumbnails" ? "space-y-2 p-2.5" : "space-y-3 p-3"}>
                  <div className="space-y-1">
                    <div className={`${viewMode === "thumbnails" ? "text-sm" : "text-base"} font-semibold leading-tight`}>
                      {display.itemPrimaryName}
                    </div>
                    <div className="text-xs text-muted-foreground">{display.itemSecondaryName}</div>
                    {viewMode === "cards" ? (
                      <div className="text-[11px] text-muted-foreground">
                        {display.metadata.weightGrams ? `${display.metadata.weightGrams}g` : ""}
                        {display.metadata.calories
                          ? `${display.metadata.weightGrams ? " · " : ""}${display.metadata.calories} kcal`
                          : ""}
                        {display.metadata.ingredients
                          ? `${display.metadata.weightGrams || display.metadata.calories ? " · " : ""}${display.metadata.ingredients}`
                          : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      {display.hasValidDiscount ? (
                        <>
                          <div className="text-[11px] text-muted-foreground line-through">
                            {Number(item.price).toLocaleString()} {t("menu.currencySuffix")}
                          </div>
                          <div className="font-semibold text-emerald-700">
                            {display.discountPriceValue?.toLocaleString()} {t("menu.currencySuffix")}
                          </div>
                        </>
                      ) : (
                        <div className="font-semibold text-primary">
                          {Number(item.price).toLocaleString()} {t("menu.currencySuffix")}
                        </div>
                      )}
                    </div>
                    <Badge variant={display.available ? "secondary" : "outline"}>
                      {display.available ? t("menu.available") : t("menu.unavailable")}
                    </Badge>
                  </div>

                  {viewMode === "cards" ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">#{item.id}</Badge>
                      <Badge variant="outline">{display.categoryLabel}</Badge>
                      <Badge variant="outline">{getStationLabel(item.station, t)}</Badge>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openItemPreview(display.itemPrimaryName, display.imageSrc)}
                      title={t("menu.previewImage")}
                      disabled={!display.imageSrc}
                    >
                      <Expand className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQrTarget(item)}
                      title={t("menu.qr.openQr")}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setItemDialog({ open: true, item })}
                      title={t("menu.editItem")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(item)}
                      title={t("menu.deleteItem")}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ItemDialog
        open={itemDialog.open}
        item={itemDialog.item}
        categories={categories}
        saving={createItem.isPending || updateItem.isPending}
        onUploadImage={handleUploadImage}
        onOpenChange={(open) => setItemDialog((prev) => ({ ...prev, open, item: open ? prev.item : undefined }))}
        onSubmit={handleSaveItem}
      />

      <Dialog open={Boolean(qrTarget)} onOpenChange={(open) => !open && setQrTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("menu.qr.title", { name: qrTarget?.name ?? "" })}</DialogTitle>
          </DialogHeader>

          {qrTarget ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("menu.qr.subtitle")}</p>
              <div className="flex items-center justify-center rounded-lg border bg-white p-3">
                <img src={menuQrImage} alt={`QR for menu item ${qrTarget.name}`} className="h-64 w-64 rounded-md" />
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs break-all">{menuQrLink}</div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      void window.navigator.clipboard.writeText(menuQrLink);
                    }
                    toast({ title: t("menu.qr.copied") });
                  }}
                >
                  {t("menu.qr.copyLink")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.open(menuQrLink, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  {t("menu.qr.openLink")}
                </Button>
                <Button
                  onClick={() =>
                    openQrPrintWindow({
                      title: qrTarget.name,
                      subtitle: t("menu.qr.subtitle"),
                      qrImageUrl: menuQrImage,
                      qrValue: menuQrLink,
                    })
                  }
                >
                  <Printer className="mr-1.5 h-4 w-4" />
                  {t("menu.qr.print")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(imagePreview)} onOpenChange={(open) => !open && setImagePreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("menu.previewTitle", { name: imagePreview?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          {imagePreview ? (
            <div className="overflow-hidden rounded-lg border bg-muted/20">
              <img src={imagePreview.url} alt={imagePreview.name} className="max-h-[70vh] w-full object-contain" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("menu.deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("menu.deleteDialogDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteItem}
            >
              {t("menu.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
