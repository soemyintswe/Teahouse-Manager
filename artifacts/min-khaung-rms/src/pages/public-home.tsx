import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  customFetch,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
  useListMenuCategories,
  useListMenuItems,
} from "@workspace/api-client-react";
import type { MenuItem } from "@workspace/api-client-react";
import { Expand, ImageIcon, Languages, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { resolveMenuImageUrl } from "@/lib/menu-image";

type PublicViewMode = "table" | "cards" | "thumbnails" | "list" | "details";
type DeliveryPaymentMethod = "cash" | "wallet";
type DeliveryWalletType = "wave_pay" | "kbz_pay" | "aya_pay" | "cb_pay";

type DeliveryProfile = {
  fullName: string;
  phone: string;
  address: string;
  mapLink: string;
};

type CartEntry = {
  menuItemId: number;
  name: string;
  nameMyanmar: string;
  price: number;
  quantity: number;
};

type DeliveryOrderResponse = {
  orderId: number;
  status: string;
  paymentMethod: string | null;
  totalAmount: string;
  message: string;
};

const VIEW_OPTIONS: Array<{ value: PublicViewMode; labelKey: string }> = [
  { value: "cards", labelKey: "menu.viewMode.cards" },
  { value: "thumbnails", labelKey: "menu.viewMode.thumbnails" },
  { value: "list", labelKey: "orders.viewMode.list" },
  { value: "details", labelKey: "orders.viewMode.details" },
  { value: "table", labelKey: "menu.viewMode.table" },
];

const STORAGE_KEY_DELIVERY_PROFILE = "teahouse_delivery_profile_v1";

function getGridClass(viewMode: PublicViewMode): string {
  if (viewMode === "thumbnails") return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
  return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
}

function formatMoney(amount: string | number): string {
  return `${Number(amount).toLocaleString()} ks`;
}

function isMyanmarText(value: string | null | undefined): boolean {
  return Boolean(value && /[\u1000-\u109f]/.test(value));
}

export default function PublicHomePage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isMyanmar = i18n.resolvedLanguage === "mm";
  const nextLanguageLabel = isMyanmar ? t("language.english") : t("language.myanmar");

  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [viewMode, setViewMode] = useState<PublicViewMode>("cards");
  const [previewItem, setPreviewItem] = useState<MenuItem | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<DeliveryPaymentMethod>("cash");
  const [walletType, setWalletType] = useState<DeliveryWalletType>("kbz_pay");

  const [deliveryProfile, setDeliveryProfile] = useState<DeliveryProfile | null>(null);
  const [registerForm, setRegisterForm] = useState<DeliveryProfile>({
    fullName: "",
    phone: "",
    address: "",
    mapLink: "",
  });

  const [cart, setCart] = useState<CartEntry[]>([]);

  const { data: categories = [], isLoading: categoriesLoading } = useListMenuCategories({
    query: { queryKey: getListMenuCategoriesQueryKey() },
  });
  const { data: menuItems = [], isLoading: menuLoading } = useListMenuItems(undefined, {
    query: { queryKey: getListMenuItemsQueryKey() },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY_DELIVERY_PROFILE);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<DeliveryProfile>;
      if (!parsed || typeof parsed !== "object") return;
      const profile: DeliveryProfile = {
        fullName: (parsed.fullName ?? "").toString(),
        phone: (parsed.phone ?? "").toString(),
        address: (parsed.address ?? "").toString(),
        mapLink: (parsed.mapLink ?? "").toString(),
      };
      if (!profile.fullName || !profile.phone || !profile.address) return;
      setDeliveryProfile(profile);
      setRegisterForm(profile);
    } catch {
      // Ignore malformed cached profile.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("register") === "1") {
      setRegisterOpen(true);
    }
  }, []);

  const filteredMenu = useMemo(() => {
    const available = menuItems.filter((item) => item.available !== "false" && item.available !== "0");
    const byCategory =
      categoryId === "all" ? available : available.filter((item) => item.categoryId === categoryId);
    const q = searchText.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.nameMyanmar.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [categoryId, menuItems, searchText]);

  const cartCount = useMemo(() => cart.reduce((sum, row) => sum + row.quantity, 0), [cart]);
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, row) => sum + row.price * row.quantity, 0),
    [cart],
  );

  const toggleLanguage = () => {
    void i18n.changeLanguage(isMyanmar ? "en" : "mm");
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((entry) => entry.menuItemId === item.id);
      if (existing) {
        return prev.map((entry) =>
          entry.menuItemId === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          nameMyanmar: item.nameMyanmar,
          price: Number(item.price),
          quantity: 1,
        },
      ];
    });
    toast({ title: t("public.cart.itemAdded") });
  };

  const changeQty = (menuItemId: number, delta: number) => {
    setCart((prev) => {
      return prev
        .map((entry) =>
          entry.menuItemId === menuItemId ? { ...entry, quantity: entry.quantity + delta } : entry,
        )
        .filter((entry) => entry.quantity > 0);
    });
  };

  const removeFromCart = (menuItemId: number) => {
    setCart((prev) => prev.filter((entry) => entry.menuItemId !== menuItemId));
  };

  const saveRegisterProfile = () => {
    if (!registerForm.fullName.trim() || !registerForm.phone.trim() || !registerForm.address.trim()) {
      toast({
        title: t("public.register.requiredTitle"),
        description: t("public.register.requiredDesc"),
        variant: "destructive",
      });
      return;
    }
    const next: DeliveryProfile = {
      fullName: registerForm.fullName.trim(),
      phone: registerForm.phone.trim(),
      address: registerForm.address.trim(),
      mapLink: registerForm.mapLink.trim(),
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_DELIVERY_PROFILE, JSON.stringify(next));
    }
    setDeliveryProfile(next);
    setRegisterOpen(false);
    toast({ title: t("public.register.saved") });
  };

  const placeDeliveryOrder = async () => {
    if (cart.length === 0) {
      toast({
        title: t("public.checkout.emptyCartTitle"),
        description: t("public.checkout.emptyCartDesc"),
        variant: "destructive",
      });
      return;
    }
    if (!deliveryProfile) {
      setCheckoutOpen(false);
      setRegisterOpen(true);
      toast({
        title: t("public.register.requiredTitle"),
        description: t("public.register.deliveryRequired"),
      });
      return;
    }

    setPlacingOrder(true);
    try {
      const response = await customFetch<DeliveryOrderResponse>("/api/orders/delivery-request", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          customerName: deliveryProfile.fullName,
          customerPhone: deliveryProfile.phone,
          deliveryAddress: deliveryProfile.address,
          googleMapLink: deliveryProfile.mapLink || undefined,
          notes: deliveryNotes.trim() || undefined,
          paymentMethod,
          walletType: paymentMethod === "wallet" ? walletType : undefined,
          items: cart.map((entry) => ({
            menuItemId: entry.menuItemId,
            quantity: entry.quantity,
          })),
        }),
      });

      setCart([]);
      setDeliveryNotes("");
      setCheckoutOpen(false);

      toast({
        title: t("public.checkout.successTitle", { id: response.orderId }),
        description: t("public.checkout.successDesc", {
          total: Number(response.totalAmount).toLocaleString(),
        }),
      });
    } catch (error) {
      toast({
        title: t("public.checkout.failedTitle"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfdf5_0%,#f8fafc_42%,#ffffff_100%)]">
      <section className="border-b border-emerald-100 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl space-y-3">
              <Badge className="border-white/25 bg-white/15 text-white hover:bg-white/20">{t("public.badge")}</Badge>
              <h1 className="text-3xl font-black leading-tight md:text-5xl">{t("public.title")}</h1>
              <p className="max-w-xl text-sm text-emerald-50 md:text-base">{t("public.subtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="bg-white text-emerald-700 hover:bg-emerald-50"
                onClick={() => setLocation("/login?mode=staff")}
              >
                {t("public.loginButton")}
              </Button>
              <Button
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
                onClick={() => setLocation("/login?mode=guest")}
              >
                {t("public.guestButton")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
                onClick={toggleLanguage}
                title={t("language.switchTo", { language: nextLanguageLabel })}
              >
                <Languages className="mr-1.5 h-4 w-4" />
                {isMyanmar ? "MM" : "EN"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 md:px-8 md:py-8">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{t("public.deliveryNotice.title")}</p>
              <p className="text-sm text-muted-foreground">{t("public.deliveryNotice.desc")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setRegisterOpen(true)}>
                {t("public.register.button")}
              </Button>
              <Button onClick={() => setCheckoutOpen(true)} disabled={cart.length === 0}>
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                {t("public.cart.checkoutButton", { count: cartCount })}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setCategoryId("all")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  categoryId === "all"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {t("public.allCategories")}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    categoryId === category.id
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {isMyanmar && isMyanmarText(category.nameMyanmar) ? category.nameMyanmar : category.name}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:w-[420px] md:flex-row">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("orders.searchPlaceholder")}
              />
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as PublicViewMode)}>
                <SelectTrigger className="md:w-52">
                  <SelectValue placeholder={t("orders.viewMode.label")} />
                </SelectTrigger>
                <SelectContent>
                  {VIEW_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {categoriesLoading || menuLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-card">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
          </div>
        ) : filteredMenu.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border bg-card text-muted-foreground">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p>{t("orders.noItemsFound")}</p>
            </div>
          </div>
        ) : viewMode === "details" || viewMode === "table" ? (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">{t("orders.menuTable.photo")}</th>
                  <th className="px-3 py-2 text-left">{t("orders.menuTable.item")}</th>
                  <th className="px-3 py-2 text-left">{t("menu.category")}</th>
                  <th className="px-3 py-2 text-left">{t("orders.menuTable.price")}</th>
                  <th className="px-3 py-2 text-right">{t("orders.menuTable.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMenu.map((item) => {
                  const category = categories.find((row) => row.id === item.categoryId);
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="h-14 w-14 overflow-hidden rounded-md border"
                          onClick={() => setPreviewItem(item)}
                        >
                          {item.imageUrl ? (
                            <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold">{isMyanmar ? item.nameMyanmar : item.name}</p>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? item.name : item.nameMyanmar}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {category ? (isMyanmar && isMyanmarText(category.nameMyanmar) ? category.nameMyanmar : category.name) : "-"}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-700">{formatMoney(item.price)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" onClick={() => addToCart(item)}>
                          <Plus className="mr-1 h-4 w-4" />
                          {t("actions.addItem")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredMenu.map((item) => (
              <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border bg-card p-2">
                <button type="button" onClick={() => setPreviewItem(item)} className="h-16 w-16 overflow-hidden rounded-md border">
                  {item.imageUrl ? (
                    <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{isMyanmar ? item.nameMyanmar : item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{isMyanmar ? item.name : item.nameMyanmar}</p>
                  <p className="font-bold text-emerald-700">{formatMoney(item.price)}</p>
                </div>
                <Button size="sm" onClick={() => addToCart(item)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t("actions.addItem")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid gap-3 ${getGridClass(viewMode)}`}>
            {filteredMenu.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <button
                  type="button"
                  className={`relative w-full overflow-hidden border-b bg-muted/30 ${
                    viewMode === "thumbnails" ? "aspect-square" : "h-36"
                  }`}
                  onClick={() => setPreviewItem(item)}
                >
                  {item.imageUrl ? (
                    <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 opacity-50" />
                    </div>
                  )}
                  <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                    <Expand className="mr-1 h-3 w-3" />
                    {t("menu.previewImage")}
                  </span>
                </button>
                <div className="space-y-2 p-3">
                  <p className="font-semibold leading-tight">{isMyanmar ? item.nameMyanmar : item.name}</p>
                  <p className="text-xs text-muted-foreground">{isMyanmar ? item.name : item.nameMyanmar}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold text-emerald-700">{formatMoney(item.price)}</p>
                    <Button size="sm" onClick={() => addToCart(item)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("actions.addItem")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {cartCount > 0 ? (
        <div className="fixed bottom-5 right-5 z-30">
          <Button size="lg" className="rounded-full shadow-lg" onClick={() => setCheckoutOpen(true)}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t("public.cart.checkoutButton", { count: cartCount })}
          </Button>
        </div>
      ) : null}

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {previewItem ? (isMyanmar ? previewItem.nameMyanmar : previewItem.name) : ""}
            </DialogTitle>
          </DialogHeader>
          {previewItem ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border bg-muted/20">
                {previewItem.imageUrl ? (
                  <img
                    src={resolveMenuImageUrl(previewItem.imageUrl)}
                    alt={previewItem.name}
                    className="max-h-[65vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10 opacity-40" />
                  </div>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {previewItem.description || t("public.preview.noDescription")}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xl font-black text-emerald-700">{formatMoney(previewItem.price)}</p>
                <Button onClick={() => addToCart(previewItem)}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("actions.addItem")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("public.register.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("public.register.subtitle")}</p>
            <div className="space-y-1">
              <Label>{t("public.register.fullName")}</Label>
              <Input
                value={registerForm.fullName}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("public.register.phone")}</Label>
              <Input
                value={registerForm.phone}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("public.register.address")}</Label>
              <Textarea
                value={registerForm.address}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, address: event.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("public.register.mapLinkOptional")}</Label>
              <Input
                value={registerForm.mapLink}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, mapLink: event.target.value }))}
                placeholder="https://maps.google.com/..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveRegisterProfile}>{t("public.register.saveButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("public.checkout.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!deliveryProfile ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">{t("public.register.requiredTitle")}</p>
                <p>{t("public.register.deliveryRequired")}</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setCheckoutOpen(false);
                    setRegisterOpen(true);
                  }}
                >
                  {t("public.register.button")}
                </Button>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{deliveryProfile.fullName}</p>
                <p>{deliveryProfile.phone}</p>
                <p>{deliveryProfile.address}</p>
                {deliveryProfile.mapLink ? <p className="text-xs text-muted-foreground">{deliveryProfile.mapLink}</p> : null}
              </div>
            )}

            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
              {cart.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("public.checkout.emptyCartDesc")}</p>
              ) : (
                cart.map((entry) => (
                  <div key={entry.menuItemId} className="rounded-md border bg-card p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{isMyanmar ? entry.nameMyanmar : entry.name}</p>
                        <p className="text-xs text-muted-foreground">{formatMoney(entry.price)}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                        onClick={() => removeFromCart(entry.menuItemId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => changeQty(entry.menuItemId, -1)}>
                          -
                        </Button>
                        <span className="w-6 text-center font-semibold">{entry.quantity}</span>
                        <Button size="sm" variant="outline" onClick={() => changeQty(entry.menuItemId, 1)}>
                          +
                        </Button>
                      </div>
                      <p className="font-semibold text-emerald-700">{formatMoney(entry.quantity * entry.price)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("public.checkout.paymentMethod")}</Label>
                <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as DeliveryPaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("public.checkout.paymentCash")}</SelectItem>
                    <SelectItem value="wallet">{t("public.checkout.paymentWallet")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod === "wallet" ? (
                <div className="space-y-1">
                  <Label>{t("public.checkout.walletType")}</Label>
                  <Select value={walletType} onValueChange={(value) => setWalletType(value as DeliveryWalletType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wave_pay">{t("cashier.wallet.wave_pay")}</SelectItem>
                      <SelectItem value="kbz_pay">{t("cashier.wallet.kbz_pay")}</SelectItem>
                      <SelectItem value="aya_pay">{t("cashier.wallet.aya_pay")}</SelectItem>
                      <SelectItem value="cb_pay">{t("cashier.wallet.cb_pay")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>{t("orders.orderNotesPlaceholder")}</Label>
              <Textarea value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} rows={2} />
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
              <span className="font-semibold">{t("orders.subtotal")}</span>
              <span className="text-lg font-black text-emerald-700">{formatMoney(cartSubtotal)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={placeDeliveryOrder} disabled={placingOrder || cart.length === 0}>
              {placingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("public.checkout.placeOrder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
