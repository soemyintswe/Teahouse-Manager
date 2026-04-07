import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useGetTable,
  useListTables,
  useListOrders,
  useListMenuCategories,
  useListMenuItems,
  useCreateOrder,
  getGetTableQueryKey,
  getListTablesQueryKey,
  getListOrdersQueryKey,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import type { MenuCategory, MenuItem, Order } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

type CartItem = {
  menuItemId: number;
  name: string;
  nameMyanmar: string;
  price: number;
  quantity: number;
};

type HistoryFilter = "today" | "open" | "paid";

const HISTORY_FILTERS: Array<{ value: HistoryFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
];

function parseTableIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get("tableId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Failed to complete request.";
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

function getOrderStatusBadgeClass(status: string): string {
  if (status === "open") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "ready_to_pay") return "border-amber-300 bg-amber-50 text-amber-700";
  if (status === "paid") return "border-blue-300 bg-blue-50 text-blue-700";
  if (status === "cancelled") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-muted bg-muted/30 text-muted-foreground";
}

function getOrderStatusLabel(status: string): string {
  if (status === "open") return "Open";
  if (status === "ready_to_pay") return "Ready to Pay";
  if (status === "paid") return "Paid";
  if (status === "cancelled") return "Cancelled";
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
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <p className="text-sm font-semibold">Orders History</p>
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
              {item.label}
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
          <div className="py-8 text-center text-sm text-muted-foreground">No orders in this filter.</div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const tableActive = activeTableId != null && order.tableId === activeTableId;
              return (
                <div key={order.id} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        Order #{order.id} · Table {order.tableNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className={getOrderStatusBadgeClass(order.status)}>
                      {getOrderStatusLabel(order.status)}
                    </Badge>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-primary">{formatMoney(order.totalAmount)}</p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => onOpenOrder(order.id)}>
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant={tableActive ? "secondary" : "outline"}
                        onClick={() => onUseTable(order.tableId)}
                        disabled={tableActive}
                      >
                        {tableActive ? "Selected" : "Use Table"}
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
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tableId = useMemo(() => parseTableIdFromSearch(search), [search]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("today");
  const todayDate = useMemo(() => toLocalDateString(new Date()), []);

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

  const createOrder = useCreateOrder();

  const selectableTables = useMemo(
    () =>
      allTables
        .filter(
          (item) =>
            item.status === "available" ||
            item.status === "dirty" ||
            item.status === "occupied" ||
            item.status === "payment_pending",
        )
        .sort((a, b) => Number(a.tableNumber) - Number(b.tableNumber)),
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

  const handleSelectTable = (nextTableId: number) => {
    setCart([]);
    setOrderNotes("");
    setSearchText("");
    setActiveCategoryId(null);
    setLocation(`/orders?tableId=${nextTableId}`);
  };

  const handleConfirmOrder = async () => {
    if (!tableId || cart.length === 0) return;

    if (existingOpenOrder) {
      toast({ title: `Table has open order #${existingOpenOrder.id}. Opening it now.` });
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

      toast({ title: `Order #${order.id} created for Table ${order.tableNumber}` });
      setLocation(`/orders/${order.id}`);
    } catch (error) {
      toast({
        title: "Unable to create order",
        description: getErrorMessage(error),
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
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">Select a table to start a new order.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {selectableTables.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectTable(item.id)}
              className="rounded-lg border bg-card px-4 py-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <p className="text-lg font-bold">Table {item.tableNumber}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {item.zone === "aircon" ? "Air-con Room" : "Hall Zone"} · {item.capacity} seats
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
        <p>Table not found.</p>
        <Button variant="outline" onClick={() => setLocation("/floor-plan")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Floor Plan
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setLocation("/floor-plan")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders · Table {table.tableNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {table.zone === "aircon" ? "Air-con Room" : "Hall Zone"} · {table.capacity} seats
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">Table ID #{table.id}</Badge>
          <Button variant="outline" size="sm" onClick={() => setLocation("/orders")}>
            Change Table
          </Button>
        </div>
      </div>

      {existingOpenOrder ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">This table already has an open order #{existingOpenOrder.id}.</p>
          <p className="text-sm">Continue the current order instead of creating a duplicate.</p>
          <Button className="mt-3" size="sm" onClick={() => setLocation(`/orders/${existingOpenOrder.id}`)}>
            Open Existing Order
          </Button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
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
              placeholder="Search menu item..."
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-3">
            {menuItemsLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <UtensilsCrossed className="mb-2 h-10 w-10 opacity-30" />
                <p>No items found</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => {
                  const quantityInCart =
                    cart.find((cartItem) => cartItem.menuItemId === item.id)?.quantity ?? 0;
                  return (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.nameMyanmar}</p>
                        </div>
                        <p className="whitespace-nowrap font-bold text-primary">
                          {formatMoney(item.price)}
                        </p>
                      </div>
                      <div className="mt-3 flex justify-end">
                        {quantityInCart > 0 ? (
                          <div className="flex items-center gap-2">
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
                          <Button size="sm" variant="outline" onClick={() => addToCart(item)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add
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
            <span className="font-semibold">Order Summary</span>
            <Badge variant="secondary" className="ml-auto">
              {cartCount} items
            </Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <ChefHat className="mb-2 h-10 w-10 opacity-25" />
                <p>Add food and drinks from the menu.</p>
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
              placeholder="Order notes (optional)"
            />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              {table.zone === "aircon" ? (
                <div className="flex justify-between text-blue-700">
                  <span>Aircon fee</span>
                  <span>+ 500 ks</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1 text-base font-bold">
                <span>Total</span>
                <span className="text-primary">{formatMoney(estimatedTotal)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={cart.length === 0 || createOrder.isPending || !!existingOpenOrder}
              onClick={handleConfirmOrder}
            >
              {createOrder.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Confirm Order
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
