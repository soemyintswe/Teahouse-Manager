import { useEffect, useMemo, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Loader2, Phone, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

type DeliveryOrder = {
  id: number;
  status: string;
  orderSource: string;
  totalAmount: string;
  paymentMethod: string | null;
  createdAt: string;
  customerName: string | null;
  customerPhones: string[];
  deliveryUnitNo: string | null;
  deliveryStreet: string | null;
  deliveryWard: string | null;
  deliveryTownship: string | null;
  deliveryRegion: string | null;
  deliveryMapLink: string | null;
  deliveryStatus: string | null;
};

const STATUS_OPTIONS = ["all", "received", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

function formatMoney(amount: string | number): string {
  return `${Number(amount).toLocaleString()} ks`;
}

function toAddressText(order: DeliveryOrder): string {
  return [order.deliveryUnitNo, order.deliveryStreet, order.deliveryWard, order.deliveryTownship, order.deliveryRegion]
    .filter(Boolean)
    .join(", ");
}

export default function DeliveryOrdersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusOption>("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [townshipFilter, setTownshipFilter] = useState("");
  const [streetFilter, setStreetFilter] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (regionFilter.trim()) params.set("region", regionFilter.trim());
      if (townshipFilter.trim()) params.set("township", townshipFilter.trim());
      if (streetFilter.trim()) params.set("street", streetFilter.trim());
      const query = params.toString();
      const data = await customFetch<DeliveryOrder[]>(`/api/delivery-orders${query ? `?${query}` : ""}`, {
        method: "GET",
        responseType: "json",
      });
      setOrders(data);
    } catch (error) {
      toast({
        title: t("deliveryOrders.loadFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, regionFilter, townshipFilter, streetFilter]);

  const totalValue = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
    [orders],
  );

  const updateStatus = async (orderId: number, status: StatusOption) => {
    if (status === "all") return;
    setUpdatingOrderId(orderId);
    try {
      await customFetch(`/api/delivery-orders/${orderId}/status`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ status }),
      });
      toast({ title: t("deliveryOrders.statusUpdated") });
      await loadOrders();
    } catch (error) {
      toast({
        title: t("deliveryOrders.updateFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{t("deliveryOrders.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("deliveryOrders.summary", { count: orders.length, total: Number(totalValue).toLocaleString() })}
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOrders()}>
          {t("common.retry")}
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-4">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusOption)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`deliveryOrders.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder={t("deliveryOrders.filter.region")} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} />
        <Input placeholder={t("deliveryOrders.filter.township")} value={townshipFilter} onChange={(e) => setTownshipFilter(e.target.value)} />
        <Input placeholder={t("deliveryOrders.filter.street")} value={streetFilter} onChange={(e) => setStreetFilter(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex h-52 items-center justify-center rounded-lg border bg-card">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
          {t("deliveryOrders.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">
                    #{order.id} · {order.customerName || t("deliveryOrders.unknownCustomer")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {order.deliveryStatus ? t(`deliveryOrders.status.${order.deliveryStatus}`) : "-"}
                  </Badge>
                  <Badge variant="secondary">{formatMoney(order.totalAmount)}</Badge>
                </div>
              </div>

              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("deliveryOrders.labels.phones")}</p>
                  <div className="flex flex-wrap gap-2">
                    {(order.customerPhones ?? []).map((phone) => (
                      <a
                        key={`${order.id}-${phone}`}
                        href={`tel:${phone}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted/40"
                      >
                        <Phone className="h-3 w-3" />
                        {phone}
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("deliveryOrders.labels.payment")}</p>
                  <p className="font-medium">{order.paymentMethod || "-"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">{t("deliveryOrders.labels.address")}</p>
                  <p>{toAddressText(order) || "-"}</p>
                  {order.deliveryMapLink ? (
                    <a href={order.deliveryMapLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                      {order.deliveryMapLink}
                    </a>
                  ) : null}
                </div>
              </div>

              {!isCustomer ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  {STATUS_OPTIONS.filter((status) => status !== "all").map((status) => (
                    <Button
                      key={`${order.id}-${status}`}
                      size="sm"
                      variant={order.deliveryStatus === status ? "default" : "outline"}
                      disabled={updatingOrderId === order.id}
                      onClick={() => void updateStatus(order.id, status)}
                    >
                      {t(`deliveryOrders.status.${status}`)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
