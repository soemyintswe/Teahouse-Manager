import { useParams, useLocation, useSearch } from "wouter";
import {
  useGetOrder,
  useAddOrderItem,
  useRemoveOrderItem,
  useUpdateOrder,
  useListMenuCategories,
  useListMenuItems,
  useGetMenuItem,
  getGetOrderQueryKey,
  getListTablesQueryKey,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
  getGetMenuItemQueryKey,
} from "@workspace/api-client-react";
import type { MenuItem, MenuCategory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, ArrowLeft, Plus, Minus, Trash2,
  CreditCard, ChefHat, Clock, CheckCircle2, Circle,
  UtensilsCrossed, Search, ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const KITCHEN_STATUS_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  new: { color: "bg-slate-100 text-slate-600 border-slate-200", icon: <Circle className="w-3 h-3" /> },
  cooking: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> },
  ready: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  served: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: <ChefHat className="w-3 h-3" /> },
};

function getKitchenStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "new") return t("orderDetail.kitchen.new");
  if (status === "cooking") return t("orderDetail.kitchen.cooking");
  if (status === "ready") return t("orderDetail.kitchen.ready");
  if (status === "served") return t("orderDetail.kitchen.served");
  return status;
}

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const search = useSearch();
  const orderId = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: order, isLoading, refetch } = useGetOrder(orderId, {
    query: {
      queryKey: getGetOrderQueryKey(orderId),
      refetchInterval: 15000,
    },
  });

  const addItem = useAddOrderItem();
  const removeItem = useRemoveOrderItem();
  const updateOrder = useUpdateOrder();

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [autoAddedFromQr, setAutoAddedFromQr] = useState<Record<number, true>>({});

  const addMenuItemIdFromQuery = useMemo(() => {
    const value = new URLSearchParams(search).get("addMenuItemId");
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [search]);

  const { data: categories = [] } = useListMenuCategories({ query: { queryKey: getListMenuCategoriesQueryKey() } });
  const resolvedCatId = activeCatId ?? (categories as MenuCategory[])[0]?.id ?? null;

  const { data: menuItems = [], isLoading: menuLoading } = useListMenuItems(
    resolvedCatId != null ? { categoryId: resolvedCatId } : undefined,
    {
      query: {
        enabled: showAddPanel && resolvedCatId != null,
        queryKey: getListMenuItemsQueryKey(resolvedCatId != null ? { categoryId: resolvedCatId } : undefined),
      },
    },
  );

  const { data: qrMenuItem } = useGetMenuItem(addMenuItemIdFromQuery ?? 0, {
    query: {
      enabled: addMenuItemIdFromQuery != null,
      queryKey: getGetMenuItemQueryKey(addMenuItemIdFromQuery ?? 0),
    },
  });

  const filteredMenuItems = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const avail = menuItems.filter((i) => i.available !== "false" && i.available !== "0");
    if (!q) return avail;
    return avail.filter((i) => i.name.toLowerCase().includes(q) || i.nameMyanmar.toLowerCase().includes(q));
  }, [menuItems, searchQ]);

  const handleAddItem = async (item: MenuItem) => {
    if (!order) return;
    try {
      await addItem.mutateAsync({ id: orderId, data: { menuItemId: item.id, quantity: 1 } });
      await refetch();
      qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: t("orderDetail.toastAdded", { name: item.name }) });
    } catch {
      toast({ title: t("orderDetail.toastAddFailed"), variant: "destructive" });
    }
  };

  const handleRemoveItem = async (itemId: number, itemName: string) => {
    try {
      await removeItem.mutateAsync({ id: orderId, itemId });
      await refetch();
      qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: t("orderDetail.toastRemoved", { name: itemName }) });
    } catch {
      toast({ title: t("orderDetail.toastRemoveFailed"), variant: "destructive" });
    }
  };

  const handleMarkReadyToPay = async () => {
    try {
      await updateOrder.mutateAsync({ id: orderId, data: { status: "ready_to_pay" } });
      await refetch();
      qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: t("orderDetail.toastReadyToPay") });
    } catch {
      toast({ title: t("orderDetail.toastUpdateFailed"), variant: "destructive" });
    }
  };

  const handleGoToCashier = () => {
    setLocation(`/cashier?orderId=${orderId}`);
  };

  useEffect(() => {
    if (!order || order.status !== "open") return;
    if (addMenuItemIdFromQuery == null || !qrMenuItem) return;
    if (autoAddedFromQr[addMenuItemIdFromQuery]) return;

    setAutoAddedFromQr((prev) => ({ ...prev, [addMenuItemIdFromQuery]: true }));
    void handleAddItem(qrMenuItem);
    setShowAddPanel(true);
  }, [addMenuItemIdFromQuery, autoAddedFromQr, order, qrMenuItem]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!order) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-semibold">{t("orderDetail.notFound")}</p>
          <Button variant="link" onClick={() => setLocation("/floor-plan")}>{t("orderDetail.backToFloor")}</Button>
        </div>
      </div>
    );
  }

  const statusBadge = {
    open: { label: t("orders.status.open"), className: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    ready_to_pay: { label: t("orders.status.readyToPay"), className: "bg-red-100 text-red-700 border-red-300" },
    paid: { label: t("orders.status.paid"), className: "bg-blue-100 text-blue-700 border-blue-300" },
    cancelled: { label: t("orders.status.cancelled"), className: "bg-slate-100 text-slate-600 border-slate-300" },
  }[order.status] ?? { label: order.status, className: "" };

  const isActive = order.status === "open";

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
        <button
          onClick={() => setLocation("/floor-plan")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {t("orderDetail.orderTitle", { id: order.id })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("orderDetail.tableMeta", { table: order.tableNumber })}
            {" · "}
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline" className={statusBadge.className}>
          {statusBadge.label}
        </Badge>
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddPanel((p) => !p)}
          >
            <Plus className="w-4 h-4 mr-1" />
            {showAddPanel ? t("orderDetail.closeMenu") : t("orderDetail.addItems")}
          </Button>
        )}
        {order.status === "open" && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={handleMarkReadyToPay}
            disabled={updateOrder.isPending}
          >
            <CreditCard className="w-4 h-4 mr-1" /> {t("orderDetail.readyToPay")}
          </Button>
        )}
        {(order.status === "open" || order.status === "ready_to_pay") && (
          <Button size="sm" className="bg-red-500 hover:bg-red-600" onClick={handleGoToCashier}>
            <CreditCard className="w-4 h-4 mr-1" /> {t("orderDetail.processPayment")}
          </Button>
        )}
      </div>

      <div className="flex-1 flex gap-5 min-h-0">
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          <div className="flex-1 overflow-y-auto">
            {order.items.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p>{t("orderDetail.noItems")}</p>
                  {isActive && (
                    <Button variant="link" onClick={() => setShowAddPanel(true)}>
                      {t("orderDetail.quickAddItems")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("orderDetail.colItem")}</th>
                      <th className="text-center px-3 py-3 font-semibold text-muted-foreground">{t("orderDetail.colQty")}</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground">{t("orderDetail.colPrice")}</th>
                      <th className="text-center px-3 py-3 font-semibold text-muted-foreground">{t("orderDetail.colKitchen")}</th>
                      {isActive && <th className="px-3 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {order.items.map((item) => {
                      const kCfg = KITCHEN_STATUS_STYLE[item.kitchenStatus] ?? KITCHEN_STATUS_STYLE.new;
                      return (
                        <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold">{item.menuItemName}</p>
                            {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                          </td>
                          <td className="px-3 py-3 text-center font-bold">{item.quantity}</td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {(Number(item.unitPrice) * item.quantity).toLocaleString()} ks
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold gap-1 ${kCfg.color}`}
                            >
                              {kCfg.icon}
                              {getKitchenStatusLabel(item.kitchenStatus, t)}
                            </Badge>
                          </td>
                          {isActive && (
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => handleRemoveItem(item.id, item.menuItemName)}
                                className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 text-muted-foreground transition-colors"
                                title={t("orderDetail.removeItem")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl p-4 flex-shrink-0">
            <div className="space-y-2 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("orders.subtotal")}</span>
                <span>{Number(order.subtotal).toLocaleString()} ks</span>
              </div>
              {Number(order.airconFee) > 0 && (
                <div className="flex justify-between text-blue-600">
                  <span>{t("orders.airconFee")}</span>
                  <span>+ {Number(order.airconFee).toLocaleString()} ks</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>{t("orderDetail.tax")}</span>
                <span>{Number(order.taxAmount).toLocaleString()} ks</span>
              </div>
              <div className="flex justify-between font-black text-base border-t pt-2">
                <span>{t("orders.total")}</span>
                <span className="text-primary">{Number(order.totalAmount).toLocaleString()} ks</span>
              </div>
            </div>
          </div>
        </div>

        {showAddPanel && isActive && (
          <div className="w-72 flex-shrink-0 flex flex-col bg-card border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30 flex-shrink-0">
              <span className="font-bold text-sm flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4 text-muted-foreground" /> {t("orderDetail.addItems")}
              </span>
              <button onClick={() => setShowAddPanel(false)} className="text-muted-foreground hover:text-foreground p-1">
                <Minus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1.5 px-2 py-2 overflow-x-auto flex-shrink-0 border-b">
              {(categories as MenuCategory[]).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCatId(cat.id)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    resolvedCatId === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative px-2 py-2 flex-shrink-0 border-b">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder={t("orderDetail.searchPlaceholder")}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {menuLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item)}
                  disabled={addItem.isPending}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-all text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-snug">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.nameMyanmar}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{Number(item.price).toLocaleString()}</span>
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                      <Plus className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
