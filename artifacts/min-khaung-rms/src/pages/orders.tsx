import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useGetTable,
  useListTables,
  useListOrders,
  useListMenuCategories,
  useListMenuItems,
  useGetMenuItem,
  useCreateOrder,
  useScanTableQr,
  getGetTableQueryKey,
  getListTablesQueryKey,
  getListOrdersQueryKey,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
  getGetMenuItemQueryKey,
} from "@workspace/api-client-react";
import type { MenuCategory, MenuItem, Order } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChefHat,
  ImageIcon,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { resolveMenuImageUrl } from "@/lib/menu-image";

const ACTIVE_TABLE_ID_STORAGE_KEY = "teahouse_active_table_id";
const GUEST_MENU_VIEW_STORAGE_KEY = "teahouse_guest_menu_view_mode";

type CartItem = {
  menuItemId: number;
  name: string;
  nameMyanmar: string;
  price: number;
  quantity: number;
};

type HistoryFilter = "today" | "open" | "paid";
type MenuViewMode = "xlarge" | "large" | "medium" | "small" | "list" | "details";
type MenuItemMetadata = {
  weightGrams?: number;
  calories?: number;
  ingredients?: string;
  discountPrice?: string;
};

type MenuMetaLine = {
  key: "weight" | "calories" | "ingredients" | "discount";
  value: string;
};

const HISTORY_FILTERS: Array<{ value: HistoryFilter; labelKey: string }> = [
  { value: "today", labelKey: "orders.history.today" },
  { value: "open", labelKey: "orders.history.open" },
  { value: "paid", labelKey: "orders.history.paid" },
];

const GUEST_MENU_VIEW_OPTIONS: Array<{ value: MenuViewMode; labelKey: string }> = [
  { value: "xlarge", labelKey: "orders.viewMode.xlarge" },
  { value: "large", labelKey: "orders.viewMode.large" },
  { value: "medium", labelKey: "orders.viewMode.medium" },
  { value: "small", labelKey: "orders.viewMode.small" },
  { value: "list", labelKey: "orders.viewMode.list" },
  { value: "details", labelKey: "orders.viewMode.details" },
];

function parseTableIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get("tableId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMenuItemIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get("menuItemId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScanFlagFromSearch(search: string): boolean {
  const value = new URLSearchParams(search).get("scan");
  return value === "1" || value === "true" || value === "yes";
}

function parseSeatSessionIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get("seatSessionId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseCustomizationPayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed metadata.
  }
  return {};
}

function getMenuItemMetadata(item: Pick<MenuItem, "customizationOptions">): MenuItemMetadata {
  const payload = parseCustomizationPayload(item.customizationOptions);
  const meta = payload.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const metadata = meta as Record<string, unknown>;
  return {
    weightGrams: typeof metadata.weightGrams === "number" ? metadata.weightGrams : undefined,
    calories: typeof metadata.calories === "number" ? metadata.calories : undefined,
    ingredients: typeof metadata.ingredients === "string" ? metadata.ingredients : undefined,
    discountPrice: typeof metadata.discountPrice === "string" ? metadata.discountPrice : undefined,
  };
}

function hasMyanmarText(value: string | null | undefined): boolean {
  if (!value) return false;
  return /[\u1000-\u109F]/.test(value);
}

function getLocalizedMenuNames(item: MenuItem, isMyanmar: boolean): { primary: string; secondary: string } {
  const mm = item.nameMyanmar?.trim() ?? "";
  const en = item.name?.trim() ?? "";

  if (isMyanmar) {
    const primary = hasMyanmarText(mm) ? mm : en;
    const secondary = hasMyanmarText(mm) ? en : "";
    return { primary, secondary };
  }

  if (en.length > 0) {
    const secondary = hasMyanmarText(mm) ? mm : "";
    return { primary: en, secondary };
  }

  return { primary: mm, secondary: "" };
}

function getMenuMetaLines(item: MenuItem): MenuMetaLine[] {
  const metadata = getMenuItemMetadata(item);
  const lines: MenuMetaLine[] = [];
  if (typeof metadata.weightGrams === "number") {
    lines.push({ key: "weight", value: String(metadata.weightGrams) });
  }
  if (typeof metadata.calories === "number") {
    lines.push({ key: "calories", value: String(metadata.calories) });
  }
  if (metadata.ingredients?.trim()) {
    lines.push({ key: "ingredients", value: metadata.ingredients.trim() });
  }
  const discount = metadata.discountPrice ? Number(metadata.discountPrice) : Number.NaN;
  if (Number.isFinite(discount) && discount > 0 && discount < Number(item.price)) {
    lines.push({ key: "discount", value: String(discount) });
  }
  return lines;
}

function getGuestGridClass(viewMode: MenuViewMode): string {
  if (viewMode === "xlarge") return "grid-cols-1";
  if (viewMode === "large") return "grid-cols-1 sm:grid-cols-2";
  if (viewMode === "small") return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
}

function formatMoney(amount: string | number): string {
  return `${Number(amount).toLocaleString()} ks`;
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getZoneLabel(zone: string, t: (key: string) => string, short = false): string {
  const normalized = zone.trim().toLowerCase();
  if (normalized === "aircon") {
    return t(short ? "zones.airconShort" : "zones.aircon");
  }
  if (normalized === "outside" || normalized === "outdoor") {
    return t(short ? "zones.outsideShort" : "zones.outside");
  }
  return t(short ? "zones.hallShort" : "zones.hall");
}

function getOrderStatusBadgeClass(status: string): string {
  if (status === "open") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "ready_to_pay") return "border-amber-300 bg-amber-50 text-amber-700";
  if (status === "paid") return "border-blue-300 bg-blue-50 text-blue-700";
  if (status === "cancelled") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-muted bg-muted/30 text-muted-foreground";
}

function getOrderStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "open") return t("orders.status.open");
  if (status === "ready_to_pay") return t("orders.status.readyToPay");
  if (status === "paid") return t("orders.status.paid");
  if (status === "cancelled") return t("orders.status.cancelled");
  return status;
}

function OrdersHistoryPanel({
  orders,
  loading,
  filter,
  onChangeFilter,
  onOpenOrder,
  onUseTable,
  activeTableId,
}: {
  orders: Order[];
  loading: boolean;
  filter: HistoryFilter;
  onChangeFilter: (value: HistoryFilter) => void;
  onOpenOrder: (orderId: number) => void;
  onUseTable: (tableId: number) => void;
  activeTableId: number | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <p className="text-sm font-semibold">{t("orders.history.title")}</p>
        <div className="ml-auto flex gap-1.5">
          {HISTORY_FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => onChangeFilter(item.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === item.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("orders.history.empty")}</div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const tableActive = activeTableId != null && order.tableId === activeTableId;
              return (
                <div key={order.id} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {t("orders.history.orderLine", { id: order.id, table: order.tableNumber })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className={getOrderStatusBadgeClass(order.status)}>
                      {getOrderStatusLabel(order.status, t)}
                    </Badge>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-primary">{formatMoney(order.totalAmount)}</p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => onOpenOrder(order.id)}>
                        {t("orders.history.openBtn")}
                      </Button>
                      <Button
                        size="sm"
                        variant={tableActive ? "secondary" : "outline"}
                        onClick={() => onUseTable(order.tableId)}
                        disabled={tableActive}
                      >
                        {tableActive ? t("orders.history.selected") : t("orders.history.useTable")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMyanmar = i18n.resolvedLanguage === "mm";

  const tableIdFromQuery = useMemo(() => parseTableIdFromSearch(search), [search]);
  const menuItemIdFromQuery = useMemo(() => parseMenuItemIdFromSearch(search), [search]);
  const seatSessionIdFromQuery = useMemo(() => parseSeatSessionIdFromSearch(search), [search]);
  const scanRequested = useMemo(() => parseScanFlagFromSearch(search), [search]);
  const [storedTableId, setStoredTableId] = useState<number | null>(null);
  const tableId =
    tableIdFromQuery ??
    user?.tableId ??
    ((scanRequested || menuItemIdFromQuery != null) ? storedTableId : null);
  const isGuest = user?.role === "guest";
  const isCustomer = user?.role === "customer";
  const isStaffMode = !isGuest && !isCustomer;
  const [menuViewMode, setMenuViewMode] = useState<MenuViewMode>("large");
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<number | null>(null);

  useEffect(() => {
    if (!isGuest || !user?.tableId) return;
    if (tableIdFromQuery != null && tableIdFromQuery !== user.tableId) {
      setLocation(`/orders?tableId=${user.tableId}&scan=1`);
    }
  }, [isGuest, setLocation, tableIdFromQuery, user?.tableId]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("today");
  const todayDate = useMemo(() => toLocalDateString(new Date()), []);

  const scanTable = useScanTableQr();
  const [scannedTableIds, setScannedTableIds] = useState<Record<number, true>>({});
  const [autoAddedMenuItemIds, setAutoAddedMenuItemIds] = useState<Record<number, true>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (tableIdFromQuery != null) {
      setStoredTableId(tableIdFromQuery);
      window.localStorage.setItem(ACTIVE_TABLE_ID_STORAGE_KEY, String(tableIdFromQuery));
      return;
    }
    const raw = window.localStorage.getItem(ACTIVE_TABLE_ID_STORAGE_KEY);
    if (!raw) return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setStoredTableId(parsed);
    }
  }, [tableIdFromQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(GUEST_MENU_VIEW_STORAGE_KEY);
    if (!raw) return;
    const allowed = GUEST_MENU_VIEW_OPTIONS.some((option) => option.value === raw);
    if (allowed) {
      setMenuViewMode(raw as MenuViewMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GUEST_MENU_VIEW_STORAGE_KEY, menuViewMode);
  }, [menuViewMode]);

  const historyQueryParams = useMemo(() => {
    if (historyFilter === "today") return { date: todayDate };
    if (historyFilter === "paid") return { status: "paid" as const };
    return undefined;
  }, [historyFilter, todayDate]);

  const { data: allTables = [], isLoading: tablesLoading } = useListTables({
    query: {
      enabled: isStaffMode,
      queryKey: getListTablesQueryKey(),
    },
  });

  const { data: table, isLoading: tableLoading } = useGetTable(tableId ?? 0, {
    query: {
      enabled: tableId != null,
      queryKey: getGetTableQueryKey(tableId ?? 0),
    },
  });

  const activeOrderParams = useMemo(
    () => (tableId != null ? { tableId, status: "open" as const } : undefined),
    [tableId],
  );

  const { data: activeOrders = [] } = useListOrders(activeOrderParams, {
    query: {
      enabled: tableId != null,
      queryKey: getListOrdersQueryKey(activeOrderParams),
    },
  });

  const { data: historyOrdersRaw = [], isLoading: historyLoading } = useListOrders(historyQueryParams, {
    query: {
      queryKey: getListOrdersQueryKey(historyQueryParams),
      refetchInterval: 10000,
    },
  });

  const historyOrders = useMemo(() => {
    if (historyFilter === "open") {
      return historyOrdersRaw.filter((order) => order.status === "open" || order.status === "ready_to_pay");
    }
    return historyOrdersRaw;
  }, [historyFilter, historyOrdersRaw]);

  const existingOpenOrder = seatSessionIdFromQuery ? undefined : activeOrders[0];

  const { data: categories = [], isLoading: categoriesLoading } = useListMenuCategories({
    query: { queryKey: getListMenuCategoriesQueryKey() },
  });

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState("");

  const resolvedCategoryId = activeCategoryId ?? categories[0]?.id ?? null;
  const menuParams = resolvedCategoryId != null ? { categoryId: resolvedCategoryId } : undefined;

  const { data: menuItems = [], isLoading: menuItemsLoading } = useListMenuItems(menuParams, {
    query: {
      enabled: resolvedCategoryId != null && tableId != null,
      queryKey: getListMenuItemsQueryKey(menuParams),
    },
  });

  const { data: scannedMenuItem } = useGetMenuItem(menuItemIdFromQuery ?? 0, {
    query: {
      enabled: menuItemIdFromQuery != null,
      queryKey: getGetMenuItemQueryKey(menuItemIdFromQuery ?? 0),
    },
  });

  const createOrder = useCreateOrder();

  const selectableTables = useMemo(
    () =>
      allTables
        .filter((item) => item.status === "Active")
        .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })),
    [allTables],
  );

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const availableItems = menuItems.filter((item) => item.available !== "false" && item.available !== "0");
    if (!q) return availableItems;
    return availableItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.nameMyanmar.toLowerCase().includes(q),
    );
  }, [menuItems, searchText]);

  const selectedMenuItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    if (selectedMenuItemId == null) return filteredItems[0];
    return filteredItems.find((item) => item.id === selectedMenuItemId) ?? filteredItems[0];
  }, [filteredItems, selectedMenuItemId]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedMenuItemId(null);
      return;
    }
    if (!filteredItems.some((item) => item.id === selectedMenuItemId)) {
      setSelectedMenuItemId(filteredItems[0].id);
    }
  }, [filteredItems, selectedMenuItemId]);

  const addToCart = (menuItem: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menuItemId === menuItem.id);
      if (existing) {
        return prev.map((item) =>
          item.menuItemId === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          menuItemId: menuItem.id,
          name: menuItem.name,
          nameMyanmar: menuItem.nameMyanmar,
          price: Number(menuItem.price),
          quantity: 1,
        },
      ];
    });
  };

  const increaseQty = (menuItemId: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.menuItemId === menuItemId ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    );
  };

  const decreaseQty = (menuItemId: number) => {
    setCart((prev) => {
      const target = prev.find((item) => item.menuItemId === menuItemId);
      if (!target) return prev;
      if (target.quantity === 1) return prev.filter((item) => item.menuItemId !== menuItemId);
      return prev.map((item) =>
        item.menuItemId === menuItemId ? { ...item, quantity: item.quantity - 1 } : item,
      );
    });
  };

  const removeFromCart = (menuItemId: number) => {
    setCart((prev) => prev.filter((item) => item.menuItemId !== menuItemId));
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const estimatedTotal = subtotal + (table?.zone === "aircon" ? 500 : 0);

  useEffect(() => {
    if (!scanRequested || tableId == null) return;
    if (scannedTableIds[tableId]) return;
    if (!table || table.status !== "Active") return;

    setScannedTableIds((prev) => ({ ...prev, [tableId]: true }));
    void scanTable
      .mutateAsync({ id: tableId })
      .then(async () => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ACTIVE_TABLE_ID_STORAGE_KEY, String(tableId));
        }
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({
          title: t("orders.qrConnectedTitle"),
          description: t("orders.qrConnectedDesc", { table: table.tableNumber }),
        });
      })
      .catch((error) => {
        toast({
          title: t("orders.qrConnectFailed"),
          description: error instanceof Error ? error.message : t("common.unknownError"),
          variant: "destructive",
        });
      });
  }, [queryClient, scanRequested, scanTable, scannedTableIds, table, tableId, t, toast]);

  useEffect(() => {
    if (menuItemIdFromQuery == null || !scannedMenuItem) return;
    if (autoAddedMenuItemIds[menuItemIdFromQuery]) return;

    if (existingOpenOrder) {
      setAutoAddedMenuItemIds((prev) => ({ ...prev, [menuItemIdFromQuery]: true }));
      setLocation(`/orders/${existingOpenOrder.id}?addMenuItemId=${menuItemIdFromQuery}`);
      return;
    }

    if (tableId == null) {
      toast({
        title: t("orders.scanTableFirstTitle"),
        description: t("orders.scanTableFirstDesc"),
        variant: "destructive",
      });
      return;
    }

    addToCart(scannedMenuItem);
    setAutoAddedMenuItemIds((prev) => ({ ...prev, [menuItemIdFromQuery]: true }));
    toast({
      title: t("orders.qrMenuAddedTitle"),
      description: t("orders.qrMenuAddedDesc", { item: scannedMenuItem.name }),
    });
  }, [
    autoAddedMenuItemIds,
    existingOpenOrder,
    menuItemIdFromQuery,
    scannedMenuItem,
    setLocation,
    tableId,
    t,
    toast,
  ]);

  const handleSelectTable = (nextTableId: number) => {
    if (isGuest && user?.tableId && nextTableId !== user.tableId) {
      toast({
        title: t("orders.guestTableLockedTitle"),
        description: t("orders.guestTableLockedDesc"),
        variant: "destructive",
      });
      return;
    }
    setCart([]);
    setOrderNotes("");
    setSearchText("");
    setActiveCategoryId(null);
    setSelectedMenuItemId(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_TABLE_ID_STORAGE_KEY, String(nextTableId));
    }
    setStoredTableId(nextTableId);
    setLocation(`/orders?tableId=${nextTableId}`);
  };

  const handleConfirmOrder = async () => {
    if (!tableId || !table || cart.length === 0) return;

    if (table.status !== "Active") {
      toast({
        title: t("orders.unavailableTitle"),
        description: t("orders.unavailableDesc"),
        variant: "destructive",
      });
      return;
    }

    if (existingOpenOrder) {
      toast({ title: t("orders.openOrderToast", { id: existingOpenOrder.id }) });
      setLocation(`/orders/${existingOpenOrder.id}`);
      return;
    }

    try {
      const order = await createOrder.mutateAsync({
        data: {
          tableId,
          seatSessionId: seatSessionIdFromQuery ?? undefined,
          notes: orderNotes.trim() || undefined,
          items: cart.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
        } as any,
      });

      await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });

      toast({ title: t("orders.createdToast", { id: order.id, table: order.tableNumber }) });
      setLocation(`/orders/${order.id}`);
    } catch (error) {
      toast({
        title: t("orders.createFailed"),
        description: error instanceof Error && error.message ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  if (tablesLoading || tableLoading || categoriesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tableId) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t("orders.pageTitle")}</h1>
        {isGuest ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            {t("orders.scanTableFirstDesc")}
          </div>
        ) : isCustomer ? (
          <div className="space-y-3 rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            <p>{t("bookings.selectTable")}</p>
            <Button variant="outline" onClick={() => setLocation("/bookings")}>
              {t("public.tableBooking")}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("orders.selectTablePrompt")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {selectableTables.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectTable(item.id)}
                  className="rounded-lg border bg-card px-4 py-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <p className="text-lg font-bold">{t("orders.tableCardTitle", { table: item.tableNumber })}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {t("orders.tableCardMeta", {
                      zone: getZoneLabel(item.zone, t),
                      seats: item.capacity,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`category.${item.category}`)}
                    {item.isBooked ? ` · ${t("floorPlan.reserved")}` : ""}
                  </p>
                </button>
              ))}
            </div>

            <OrdersHistoryPanel
              orders={historyOrders.slice(0, 20)}
              loading={historyLoading}
              filter={historyFilter}
              onChangeFilter={setHistoryFilter}
              onOpenOrder={(orderId) => setLocation(`/orders/${orderId}`)}
              onUseTable={handleSelectTable}
              activeTableId={tableId}
            />
          </>
        )}
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{t("orders.tableNotFound")}</p>
        <Button variant="outline" onClick={() => setLocation(isGuest ? "/orders" : (isCustomer ? "/bookings" : "/floor-plan"))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isCustomer ? t("bookings.backToMenu") : t("orders.backToFloor")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-x-hidden">
      <div className="flex max-w-full flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setLocation(isGuest ? "/orders" : (isCustomer ? "/bookings" : "/floor-plan"))}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("orders.header", { table: table.tableNumber })}</h1>
          <p className="text-sm text-muted-foreground">
            {t("orders.headerMeta", {
              zone: getZoneLabel(table.zone, t),
              seats: table.capacity,
              category: t(`category.${table.category}`),
            })}
            {table.isBooked ? ` · ${t("floorPlan.reserved")}` : ""}
          </p>
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Badge variant="outline">{t("floorPlan.tableId", { id: table.id })}</Badge>
          {isStaffMode ? (
            <Button variant="outline" size="sm" onClick={() => setLocation("/orders")}>
              {t("orders.changeTable")}
            </Button>
          ) : null}
        </div>
      </div>

      {existingOpenOrder ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">{t("orders.existingOpenTitle", { id: existingOpenOrder.id })}</p>
          <p className="text-sm">{t("orders.existingOpenDesc")}</p>
          <Button className="mt-3" size="sm" onClick={() => setLocation(`/orders/${existingOpenOrder.id}`)}>
            {t("orders.openExisting")}
          </Button>
        </div>
      ) : null}

      {table.status !== "Active" ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
          <p className="font-semibold">{t("orders.unavailableTitle")}</p>
          <p className="text-sm">{t("orders.onlyActiveDesc")}</p>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col gap-3">
          {selectedMenuItem ? (
            <div className="rounded-lg border bg-card p-3">
              <div className="grid gap-3 sm:grid-cols-[168px_minmax(0,1fr)]">
                <button
                  type="button"
                  className="overflow-hidden rounded-md border bg-muted/30 text-left"
                  onClick={() => setSelectedMenuItemId(selectedMenuItem.id)}
                >
                  {selectedMenuItem.imageUrl ? (
                    <img
                      src={resolveMenuImageUrl(selectedMenuItem.imageUrl)}
                      alt={selectedMenuItem.name}
                      className="h-40 w-full object-cover sm:h-full"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center text-muted-foreground sm:h-full">
                      <ImageIcon className="h-10 w-10 opacity-40" />
                    </div>
                  )}
                </button>
                <div className="min-w-0">
                  {(() => {
                    const names = getLocalizedMenuNames(selectedMenuItem, isMyanmar);
                    const quantityInCart =
                      cart.find((cartItem) => cartItem.menuItemId === selectedMenuItem.id)?.quantity ?? 0;
                    const metaLines = getMenuMetaLines(selectedMenuItem);
                    return (
                      <>
                        <p className="text-lg font-semibold leading-tight break-words">{names.primary}</p>
                        {names.secondary ? (
                          <p className="mt-1 text-sm text-muted-foreground">{names.secondary}</p>
                        ) : null}
                        {selectedMenuItem.description ? (
                          <p className="mt-2 text-sm text-muted-foreground">{selectedMenuItem.description}</p>
                        ) : null}
                        {metaLines.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {metaLines.map((line) => (
                              <Badge key={`${selectedMenuItem.id}-${line.key}`} variant="outline" className="text-xs">
                                {line.key === "weight" ? t("orders.meta.weight", { value: line.value }) : null}
                                {line.key === "calories" ? t("orders.meta.calories", { value: line.value }) : null}
                                {line.key === "ingredients" ? t("orders.meta.ingredients", { value: line.value }) : null}
                                {line.key === "discount"
                                  ? t("orders.meta.discount", { value: formatMoney(Number(line.value)) })
                                  : null}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xl font-bold text-primary">{formatMoney(selectedMenuItem.price)}</p>
                          {quantityInCart > 0 ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => decreaseQty(selectedMenuItem.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border hover:bg-muted"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-5 text-center text-sm font-bold">{quantityInCart}</span>
                              <button
                                onClick={() => addToCart(selectedMenuItem)}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => addToCart(selectedMenuItem)}>
                              <Plus className="mr-1.5 h-4 w-4" />
                              {t("actions.addItem")}
                            </Button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 pr-1">
              {(categories as MenuCategory[]).map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setSearchText("");
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    resolvedCategoryId === category.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isMyanmar && hasMyanmarText(category.nameMyanmar) ? category.nameMyanmar : category.name}
                </button>
              ))}
            </div>
            <div className="w-full md:w-56">
              <Select value={menuViewMode} onValueChange={(value) => setMenuViewMode(value as MenuViewMode)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("orders.viewMode.label")} />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_MENU_VIEW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="pl-9"
              placeholder={t("orders.searchPlaceholder")}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg border bg-card p-3">
            {menuItemsLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <UtensilsCrossed className="mb-2 h-10 w-10 opacity-30" />
                <p>{t("orders.noItemsFound")}</p>
              </div>
            ) : menuViewMode === "details" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">{t("orders.menuTable.photo")}</TableHead>
                      <TableHead>{t("orders.menuTable.item")}</TableHead>
                      <TableHead className="text-right">{t("orders.menuTable.price")}</TableHead>
                      <TableHead className="text-right">{t("orders.menuTable.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const names = getLocalizedMenuNames(item, isMyanmar);
                      const quantityInCart = cart.find((cartItem) => cartItem.menuItemId === item.id)?.quantity ?? 0;
                      const isSelected = selectedMenuItem?.id === item.id;
                      return (
                        <TableRow
                          key={item.id}
                          className={isSelected ? "bg-primary/5" : undefined}
                          onClick={() => setSelectedMenuItemId(item.id)}
                        >
                          <TableCell>
                            <button type="button" className="overflow-hidden rounded-md border">
                              {item.imageUrl ? (
                                <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-14 w-14 object-cover" />
                              ) : (
                                <div className="flex h-14 w-14 items-center justify-center bg-muted/30 text-muted-foreground">
                                  <ImageIcon className="h-5 w-5 opacity-40" />
                                </div>
                              )}
                            </button>
                          </TableCell>
                          <TableCell>
                            <p className="font-semibold">{names.primary}</p>
                            {names.secondary ? <p className="text-xs text-muted-foreground">{names.secondary}</p> : null}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatMoney(item.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {quantityInCart > 0 ? (
                              <div className="ml-auto flex w-fit items-center gap-2">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    decreaseQty(item.id);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border hover:bg-muted"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-5 text-center text-sm font-bold">{quantityInCart}</span>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    addToCart(item);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  addToCart(item);
                                }}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                {t("actions.addItem")}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : menuViewMode === "list" ? (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const names = getLocalizedMenuNames(item, isMyanmar);
                  const quantityInCart = cart.find((cartItem) => cartItem.menuItemId === item.id)?.quantity ?? 0;
                  return (
                    <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMenuItemId(item.id)}
                        className="overflow-hidden rounded-md border"
                      >
                        {item.imageUrl ? (
                          <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-16 w-16 object-cover" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center bg-muted/30 text-muted-foreground">
                            <ImageIcon className="h-5 w-5 opacity-40" />
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMenuItemId(item.id)}
                        className="min-w-0 text-left"
                      >
                        <p className="truncate font-semibold">{names.primary}</p>
                        {names.secondary ? <p className="truncate text-xs text-muted-foreground">{names.secondary}</p> : null}
                        <p className="text-sm font-bold text-primary">{formatMoney(item.price)}</p>
                      </button>
                      {quantityInCart > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => decreaseQty(item.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border hover:bg-muted"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center text-sm font-bold">{quantityInCart}</span>
                          <button
                            onClick={() => addToCart(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => addToCart(item)} className="whitespace-nowrap px-2.5">
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {t("actions.addItem")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`grid gap-3 ${getGuestGridClass(menuViewMode)}`}>
                {filteredItems.map((item) => {
                  const names = getLocalizedMenuNames(item, isMyanmar);
                  const quantityInCart = cart.find((cartItem) => cartItem.menuItemId === item.id)?.quantity ?? 0;
                  return (
                    <div key={item.id} className="min-w-0 rounded-lg border p-3">
                      <button
                        type="button"
                        className="mb-2 block w-full overflow-hidden rounded-md border"
                        onClick={() => setSelectedMenuItemId(item.id)}
                      >
                        {item.imageUrl ? (
                          <img src={resolveMenuImageUrl(item.imageUrl)} alt={item.name} className="h-28 w-full object-cover" />
                        ) : (
                          <div className="flex h-28 w-full items-center justify-center bg-muted/30 text-muted-foreground">
                            <ImageIcon className="h-8 w-8 opacity-40" />
                          </div>
                        )}
                      </button>
                      <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between md:gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="font-semibold leading-tight break-words text-left hover:text-primary"
                            onClick={() => setSelectedMenuItemId(item.id)}
                          >
                            {names.primary}
                          </button>
                          {names.secondary ? (
                            <p className="truncate text-xs text-muted-foreground">{names.secondary}</p>
                          ) : null}
                        </div>
                        <p className="text-base font-bold text-primary md:shrink-0 md:text-right">
                          {formatMoney(item.price)}
                        </p>
                      </div>
                      <div className="mt-2 flex justify-end">
                        {quantityInCart > 0 ? (
                          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
                            <button
                              onClick={() => decreaseQty(item.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-full border hover:bg-muted"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-sm font-bold">{quantityInCart}</span>
                            <button
                              onClick={() => addToCart(item)}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addToCart(item)}
                            className="w-full md:w-auto"
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            {t("actions.addItem")}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{t("orders.orderSummary")}</span>
            <Badge variant="secondary" className="ml-auto">
              {t("orders.itemsCount", { count: cartCount })}
            </Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <ChefHat className="mb-2 h-10 w-10 opacity-25" />
                <p>{t("orders.addFoodPrompt")}</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.menuItemId} className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(item.price * item.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => decreaseQty(item.menuItemId)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border hover:bg-background"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-4 text-center text-sm font-bold">{item.quantity}</span>
                      <button
                        onClick={() => increaseQty(item.menuItemId)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.menuItemId)}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-red-100 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t p-4 space-y-3">
            <Input
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              placeholder={t("orders.orderNotesPlaceholder")}
            />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("orders.subtotal")}</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              {table.zone === "aircon" ? (
                <div className="flex justify-between text-blue-700">
                  <span>{t("orders.airconFee")}</span>
                  <span>+ 500 ks</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1 text-base font-bold">
                <span>{t("orders.total")}</span>
                <span className="text-primary">{formatMoney(estimatedTotal)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={table.status !== "Active" || cart.length === 0 || createOrder.isPending || !!existingOpenOrder}
              onClick={handleConfirmOrder}
            >
              {createOrder.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("actions.confirmOrder")}
            </Button>
          </div>
        </div>
      </div>

      {!isGuest ? (
        <OrdersHistoryPanel
          orders={historyOrders.slice(0, 20)}
          loading={historyLoading}
          filter={historyFilter}
          onChangeFilter={setHistoryFilter}
          onOpenOrder={(orderId) => setLocation(`/orders/${orderId}`)}
          onUseTable={handleSelectTable}
          activeTableId={tableId}
        />
      ) : null}
    </div>
  );
}
