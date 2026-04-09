import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useListMenuCategories, useListMenuItems, getListMenuCategoriesQueryKey, getListMenuItemsQueryKey } from "@workspace/api-client-react";
import type { MenuItem } from "@workspace/api-client-react";
import { ImageIcon, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { buildMenuItemScanLink, buildQrImageUrl } from "@/lib/qr-links";
import { resolveMenuImageUrl } from "@/lib/menu-image";

type PublicViewMode = "xlarge" | "large" | "medium" | "small" | "list" | "details";

const VIEW_OPTIONS: Array<{ value: PublicViewMode; labelKey: string }> = [
  { value: "xlarge", labelKey: "orders.viewMode.xlarge" },
  { value: "large", labelKey: "orders.viewMode.large" },
  { value: "medium", labelKey: "orders.viewMode.medium" },
  { value: "small", labelKey: "orders.viewMode.small" },
  { value: "list", labelKey: "orders.viewMode.list" },
  { value: "details", labelKey: "orders.viewMode.details" },
];

function getGridClass(viewMode: PublicViewMode): string {
  if (viewMode === "xlarge") return "grid-cols-1";
  if (viewMode === "large") return "grid-cols-1 sm:grid-cols-2";
  if (viewMode === "small") return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
}

function formatMoney(amount: string | number): string {
  return `${Number(amount).toLocaleString()} ks`;
}

export default function PublicHomePage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const isMyanmar = i18n.resolvedLanguage === "mm";
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [viewMode, setViewMode] = useState<PublicViewMode>("large");

  const { data: categories = [], isLoading: categoriesLoading } = useListMenuCategories({
    query: { queryKey: getListMenuCategoriesQueryKey() },
  });

  const selectedCategoryId = categoryId ?? categories[0]?.id ?? null;
  const menuParams = selectedCategoryId != null ? { categoryId: selectedCategoryId } : undefined;
  const { data: menuItems = [], isLoading: menuLoading } = useListMenuItems(menuParams, {
    query: {
      enabled: selectedCategoryId != null,
      queryKey: getListMenuItemsQueryKey(menuParams),
    },
  });

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const available = menuItems.filter((item) => item.available !== "false" && item.available !== "0");
    if (!q) return available;
    return available.filter((item) => {
      const name = isMyanmar ? item.nameMyanmar : item.name;
      return name.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || item.nameMyanmar.toLowerCase().includes(q);
    });
  }, [isMyanmar, menuItems, searchText]);

  const featured = filtered.slice(0, 12);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfdf5_0%,#f8fafc_42%,#ffffff_100%)]">
      <section className="border-b border-emerald-100 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl space-y-3">
              <Badge className="border-white/25 bg-white/15 text-white hover:bg-white/20">{t("public.badge")}</Badge>
              <h1 className="text-3xl font-black leading-tight md:text-5xl">{t("public.title")}</h1>
              <p className="max-w-xl text-sm text-emerald-50 md:text-base">{t("public.subtitle")}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="bg-white text-emerald-700 hover:bg-emerald-50"
                onClick={() => setLocation("/login")}
              >
                {t("public.loginButton")}
              </Button>
              <Link href="/login" className="inline-flex items-center rounded-md border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                {t("public.guestButton")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 md:px-8 md:py-8">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    selectedCategoryId === category.id
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {isMyanmar ? category.nameMyanmar : category.name}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:w-[360px] md:flex-row">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("orders.searchPlaceholder")}
              />
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as PublicViewMode)}>
                <SelectTrigger className="md:w-48">
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
        ) : viewMode === "details" ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">{t("orders.menuTable.photo")}</th>
                  <th className="px-3 py-2 text-left">{t("orders.menuTable.item")}</th>
                  <th className="px-3 py-2 text-left">{t("orders.menuTable.price")}</th>
                  <th className="px-3 py-2 text-left">QR</th>
                </tr>
              </thead>
              <tbody>
                {featured.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="h-14 w-14 overflow-hidden rounded-md border">
                        {item.imageUrl ? (
                          <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{isMyanmar ? item.nameMyanmar : item.name}</p>
                      <p className="text-xs text-muted-foreground">{isMyanmar ? item.name : item.nameMyanmar}</p>
                    </td>
                    <td className="px-3 py-2 font-bold text-emerald-700">{formatMoney(item.price)}</td>
                    <td className="px-3 py-2">
                      <img src={buildQrImageUrl(buildMenuItemScanLink(item.id), 96)} alt={`QR ${item.name}`} className="h-12 w-12 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {featured.map((item) => (
              <MenuListRow key={item.id} item={item} isMyanmar={isMyanmar} />
            ))}
          </div>
        ) : (
          <div className={`grid gap-3 ${getGridClass(viewMode)}`}>
            {featured.map((item) => (
              <MenuCard key={item.id} item={item} isMyanmar={isMyanmar} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function MenuCard({ item, isMyanmar }: { item: MenuItem; isMyanmar: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="h-36 w-full bg-muted/30">
        {item.imageUrl ? (
          <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-50" />
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="font-semibold leading-tight">{isMyanmar ? item.nameMyanmar : item.name}</p>
        <p className="text-xs text-muted-foreground">{isMyanmar ? item.name : item.nameMyanmar}</p>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-emerald-700">{formatMoney(item.price)}</p>
          <img src={buildQrImageUrl(buildMenuItemScanLink(item.id), 92)} alt={`QR ${item.name}`} className="h-10 w-10 rounded" />
        </div>
      </div>
    </div>
  );
}

function MenuListRow({ item, isMyanmar }: { item: MenuItem; isMyanmar: boolean }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_52px] items-center gap-2 rounded-xl border bg-card p-2">
      <div className="h-16 w-16 overflow-hidden rounded-md border">
        {item.imageUrl ? (
          <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{isMyanmar ? item.nameMyanmar : item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{isMyanmar ? item.name : item.nameMyanmar}</p>
        <p className="font-bold text-emerald-700">{formatMoney(item.price)}</p>
      </div>
      <div className="flex items-center justify-center">
        <QrCode className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
