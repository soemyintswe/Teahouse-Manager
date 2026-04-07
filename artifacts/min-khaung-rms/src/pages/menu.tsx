import { useEffect, useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Loader2, UtensilsCrossed } from "lucide-react";
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

const STATION_OPTIONS = ["salad", "tea-coffee", "juice", "kitchen"] as const;

type StationCode = (typeof STATION_OPTIONS)[number];
type StationFilter = "all" | StationCode;

type ItemFormState = {
  name: string;
  nameMyanmar: string;
  categoryId: string;
  station: StationCode;
  price: string;
  description: string;
  available: boolean;
};

function getStationLabel(station: StationCode, t: (key: string) => string): string {
  return t(`station.${station}`);
}

function buildInitialItemForm(item: MenuItem | undefined, categories: MenuCategory[]): ItemFormState {
  return {
    name: item?.name ?? "",
    nameMyanmar: item?.nameMyanmar ?? "",
    categoryId: String(item?.categoryId ?? categories[0]?.id ?? ""),
    station: item?.station ?? "kitchen",
    price: item?.price ?? "",
    description: item?.description ?? "",
    available: item ? item.available !== "false" && item.available !== "0" : true,
  };
}

function ItemDialog({
  open,
  item,
  categories,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  item?: MenuItem;
  categories: MenuCategory[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateMenuItemBody | UpdateMenuItemBody) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ItemFormState>(() => buildInitialItemForm(item, categories));

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
    const payload = {
      name: form.name.trim(),
      nameMyanmar: form.nameMyanmar.trim() || form.name.trim(),
      categoryId: Number(form.categoryId),
      station: form.station,
      price: form.price.trim(),
      description: form.description.trim() || undefined,
      available: form.available ? "true" : "false",
    };
    onSubmit(payload);
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
                      {category.name}
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
  const { t } = useTranslation();
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
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: MenuItem }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  const categoryNameById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category.name]));
  }, [categories]);

  const filteredItems = useMemo(() => {
    if (stationFilter === "all") return menuItems;
    return menuItems.filter((item) => item.station === stationFilter);
  }, [menuItems, stationFilter]);

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: getListMenuItemsQueryKey() });
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
          <h1 className="text-3xl font-bold tracking-tight">{t("menu.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("menu.itemsCount", { count: menuItems.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={stationFilter} onValueChange={(value) => setStationFilter(value as StationFilter)}>
            <SelectTrigger className="w-44">
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
          <Button
            onClick={() => setItemDialog({ open: true })}
            disabled={categories.length === 0}
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
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableSettings.columns.id")}</TableHead>
                <TableHead>{t("menu.itemName")}</TableHead>
                <TableHead>{t("menu.category")}</TableHead>
                <TableHead>{t("menu.station")}</TableHead>
                <TableHead className="text-right">{t("menu.price")}</TableHead>
                <TableHead>{t("menu.status")}</TableHead>
                <TableHead className="text-right">{t("tableSettings.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t("menu.noItemsForFilter")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const available = item.available !== "false" && item.available !== "0";
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">#{item.id}</TableCell>
                      <TableCell>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.nameMyanmar}</div>
                      </TableCell>
                      <TableCell>{categoryNameById.get(item.categoryId) ?? `Category #${item.categoryId}`}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getStationLabel(item.station, t)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {Number(item.price).toLocaleString()} ks
                      </TableCell>
                      <TableCell>
                        <Badge variant={available ? "secondary" : "outline"}>
                          {available ? t("menu.available") : t("menu.unavailable")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
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
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ItemDialog
        open={itemDialog.open}
        item={itemDialog.item}
        categories={categories}
        saving={createItem.isPending || updateItem.isPending}
        onOpenChange={(open) => setItemDialog((prev) => ({ ...prev, open, item: open ? prev.item : undefined }))}
        onSubmit={handleSaveItem}
      />

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
