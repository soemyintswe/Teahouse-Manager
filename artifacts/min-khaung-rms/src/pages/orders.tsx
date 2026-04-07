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
import { useToast } from "@/hooks/use-toast";

const ACTIVE_TABLE_ID_STORAGE_KEY = "teahouse_active_table_id";

type CartItem = {
  menuItemId: number;
  name: string;
  nameMyanmar: string;
  price: number;
  quantity: number;
};

type HistoryFilter = "today" | "open" | "paid";

const HISTORY_FILTERS: Array<{ value: HistoryFilter; labelKey: string }> = [
  { value: "today", labelKey: "orders.history.today" },
  { value: "open", labelKey: "orders.history.open" },
  { value: "paid", labelKey: "orders.history.paid" },
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
  if (zone === "aircon") {
    return t(short ? "zones.airconShort" : "zones.aircon");
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
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tableIdFromQuery = useMemo(() => parseTableIdFromSearch(search), [search]);
  const menuItemIdFromQuery = useMemo(() => parseMenuItemIdFromSearch(search), [search]);
  const scanRequested = useMemo(() => parseScanFlagFromSearch(search), [search]);
  const [storedTableId, setStoredTableId] = useState<number | null>(null);
  const tableId =
    tableIdFromQuery ?? ((scanRequested || menuItemIdFromQuery != null) ? storedTableId : null);
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

  const historyQueryParams = useMemo(() => {
    if (historyFilter === "today") return { date: todayDate };
    if (historyFilter === "paid") return { status: "paid" as const };
    return undefined;
  }, [historyFilter, todayDate]);

  const { data: allTables = [], isLoading: tablesLoading } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
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

  const existingOpenOrder = activeOrders[0];

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
    setCart([]);
    setOrderNotes("");
    setSearchText("");
    setActiveCategoryId(null);
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
          notes: orderNotes.trim() || undefined,
          items: cart.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
        },
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
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{t("orders.tableNotFound")}</p>
        <Button variant="outline" onClick={() => setLocation("/floor-plan")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("orders.backToFloor")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-x-hidden">
      <div className="flex max-w-full flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setLocation("/floor-plan")}>
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
          <Button variant="outline" size="sm" onClick={() => setLocation("/orders")}>
            {t("orders.changeTable")}
          </Button>
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
                {category.name}
              </button>
            ))}
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
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => {
                  const quantityInCart =
                    cart.find((cartItem) => cartItem.menuItemId === item.id)?.quantity ?? 0;
                  return (
                    <div key={item.id} className="min-w-0 rounded-lg border p-3">
                      <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between md:gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight break-words">{item.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.nameMyanmar}</p>
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

      <OrdersHistoryPanel
        orders={historyOrders.slice(0, 20)}
        loading={historyLoading}
        filter={historyFilter}
        onChangeFilter={setHistoryFilter}
        onOpenOrder={(orderId) => setLocation(`/orders/${orderId}`)}
        onUseTable={handleSelectTable}
        activeTableId={tableId}
      />
    </div>
  );
}
