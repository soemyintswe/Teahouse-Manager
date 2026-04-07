import { useMemo } from "react";
import {
  useListKitchenOrders,
  getListKitchenOrdersQueryKey,
  useUpdateKitchenItemStatus,
} from "@workspace/api-client-react";
import type { ListKitchenOrdersParams } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Clock, ChefHat } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";

const STATIONS = ["salad", "tea-coffee", "juice", "kitchen"] as const;

type StationCode = (typeof STATIONS)[number];

function isStationCode(value: string | null): value is StationCode {
  return STATIONS.some((station) => station === value);
}

function getStationLabel(station: StationCode, t: (key: string) => string): string {
  return t(`station.${station}`);
}

export default function Kitchen() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const station = useMemo<StationCode>(() => {
    const stationFromQuery = new URLSearchParams(search).get("station");
    return isStationCode(stationFromQuery) ? stationFromQuery : "kitchen";
  }, [search]);

  const listParams = useMemo<ListKitchenOrdersParams>(() => ({ station }), [station]);

  const { data: orders, isLoading } = useListKitchenOrders(listParams, {
    query: {
      queryKey: getListKitchenOrdersQueryKey(listParams),
      refetchInterval: 10000,
    },
  });
  const updateStatus = useUpdateKitchenItemStatus();

  const handleStationChange = (nextStation: StationCode) => {
    setLocation(`/kds?station=${nextStation}`);
  };

  const handleDone = (itemId: number, currentStatus: string) => {
    if (currentStatus === "ready" || currentStatus === "served") return;

    updateStatus.mutate(
      {
        itemId,
        data: { kitchenStatus: "ready" },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListKitchenOrdersQueryKey(listParams),
          });
        },
      },
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-100 border-blue-300 text-blue-900";
      case "cooking":
        return "bg-orange-100 border-orange-300 text-orange-900";
      case "ready":
        return "bg-green-100 border-green-300 text-green-900";
      default:
        return "bg-gray-100 border-gray-300 text-gray-900";
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex flex-col gap-4 bg-primary text-primary-foreground p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <ChefHat className="h-8 w-8" />
          <div>
            <h1 className="page-title">{t("kitchen.title")}</h1>
            <p className="text-sm opacity-90">{t("kitchen.station", { station: getStationLabel(station, t) })}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATIONS.map((item) => (
            <Button
              key={item}
              variant={station === item ? "secondary" : "outline"}
              className={station === item ? "text-foreground" : "text-primary-foreground border-primary-foreground/60"}
              onClick={() => handleStationChange(item)}
            >
              {getStationLabel(item, t)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-auto pb-4">
        {orders?.map((order) => (
          <Card key={order.orderId} className="flex flex-col border-2 shadow-md">
            <CardHeader className="bg-muted pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl font-black">{t("kitchen.table", { table: order.tableNumber })}</CardTitle>
                  <span className="text-sm font-semibold uppercase text-muted-foreground">
                    {order.zone === "aircon" ? t("zones.airconShort") : t("zones.hallShort")}
                  </span>
                </div>
                <div className="flex items-center text-red-600 font-bold bg-red-100 px-2 py-1 rounded">
                  <Clock className="w-4 h-4 mr-1" />
                  {formatDistanceToNow(new Date(order.orderTime))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-2 space-y-2 overflow-y-auto">
              {order.items.map((item) => {
                const ready = item.kitchenStatus === "ready";
                return (
                  <div key={item.id} className={`p-3 rounded border-2 transition-colors ${getStatusColor(item.kitchenStatus)}`}>
                    <div className="flex justify-between items-start font-bold text-lg">
                      <div className="flex items-start gap-2">
                        <span className="bg-background/50 px-2 py-0.5 rounded">{item.quantity}x</span>
                        <span>{item.menuItemName}</span>
                      </div>
                      {ready && <CheckCircle className="text-green-600" />}
                    </div>
                    {(item.customizations || item.notes) && (
                      <div className="mt-2 text-sm opacity-90 pl-10 border-l-2 border-current ml-2">
                        {item.customizations && <p className="italic">{item.customizations}</p>}
                        {item.notes && <p className="font-semibold text-red-700">{t("kitchen.note")} {item.notes}</p>}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleDone(item.id, item.kitchenStatus)}
                        disabled={ready || updateStatus.isPending}
                        className={ready ? "opacity-75" : ""}
                      >
                        {ready ? t("kitchen.ready") : t("kitchen.done")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
        {(!orders || orders.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center text-muted-foreground h-[400px]">
            <CheckCircle className="h-16 w-16 mb-4 text-green-500 opacity-50" />
            <h2 className="text-2xl font-bold">{t("kitchen.allClear", { station: getStationLabel(station, t) })}</h2>
            <p>{t("kitchen.noActiveItems")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
