import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useListTables,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  DollarSign,
  ShoppingBag,
  Map as MapIcon,
  AlertTriangle,
  ArrowRight,
  Users,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crown,
  BookmarkCheck,
  Lock,
} from "lucide-react";
import { listRooms, ROOMS_QUERY_KEY } from "@/lib/rooms-api";

type TableData = {
  id: number;
  tableNumber: string;
  zone: string;
  capacity: number;
  category: "Standard" | "VIP" | "Buffer";
  status: "Active" | "Maintenance" | "Archived";
  isBooked: boolean;
  occupancyStatus: "available" | "occupied" | "payment_pending" | "paid" | "dirty";
  posX: number;
  posY: number;
  currentOrderId: number | null;
};

type RoomOption = {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

const TABLE_STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-500 text-white border-emerald-700",
  occupied: "bg-amber-400 text-amber-950 border-amber-600",
  payment_pending: "bg-red-500 text-white border-red-700",
  paid: "bg-blue-500 text-white border-blue-700",
  dirty: "bg-slate-400 text-white border-slate-600",
};

const DASHBOARD_CANVAS_WIDTH = 620;
const DASHBOARD_CANVAS_HEIGHT = 320;
const DEFAULT_DASHBOARD_ZOOM = 0.8;

function formatRoomCodeLabel(code: string): string {
  const normalized = code.trim();
  if (!normalized) return "Room";
  return normalized
    .split("-")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function getOccupancyStatusLabel(status: TableData["occupancyStatus"], t: (key: string) => string): string {
  return t(`status.occupancy.${status}`);
}

function SummaryCard({
  title,
  icon,
  onClick,
  children,
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className="w-full text-left" onClick={onClick}>
      <Card className="transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.99]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 py-2 sm:px-6 sm:py-4">
          <CardTitle className="text-xs font-medium sm:text-sm">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 sm:px-6 sm:pb-5">{children}</CardContent>
      </Card>
    </button>
  );
}

function FloorPreviewCard({
  table,
  onClick,
}: {
  table: TableData;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const isMaintenance = table.status === "Maintenance";
  const styleClass = isMaintenance
    ? "bg-slate-300 text-slate-100 border-slate-500"
    : (TABLE_STATUS_STYLE[table.occupancyStatus] ?? TABLE_STATUS_STYLE.available);

  return (
    <button
      onClick={onClick}
      className={`absolute h-16 w-16 rounded-lg border-2 text-center shadow-md transition-all sm:h-20 sm:w-20 ${isMaintenance ? "cursor-not-allowed" : "hover:scale-105"} ${styleClass}`}
      style={{ left: table.posX, top: table.posY }}
      disabled={isMaintenance}
    >
      {isMaintenance ? <Lock className="absolute left-1 top-1 h-3 w-3" /> : null}
      {table.category === "VIP" ? <Crown className="absolute right-1 top-1 h-3 w-3" /> : null}
      {table.isBooked ? <BookmarkCheck className="absolute right-1 bottom-1 h-3 w-3" /> : null}
      <div className="pt-1 text-[11px] font-black leading-none">{table.tableNumber}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] opacity-90">
        <Users className="h-3 w-3" />
        {table.capacity}
      </div>
      <div className="text-[8px] font-bold leading-none">
        {isMaintenance ? t("status.service.Maintenance") : getOccupancyStatusLabel(table.occupancyStatus, t)}
      </div>
    </button>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [previewZoom, setPreviewZoom] = useState(DEFAULT_DASHBOARD_ZOOM);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: tables = [], isLoading: tablesLoading } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
  });
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: listRooms,
    staleTime: 15000,
  });

  const handleZoomIn = useCallback(() => {
    setPreviewZoom((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPreviewZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setPreviewZoom(DEFAULT_DASHBOARD_ZOOM);
  }, []);

  const visibleTables = (tables as TableData[]).filter((table) => table.status !== "Archived");
  const roomOptions = useMemo<RoomOption[]>(() => {
    const map = new Map<string, RoomOption>();

    for (const room of rooms) {
      map.set(room.code, {
        code: room.code,
        name: room.name,
        isActive: room.isActive,
        sortOrder: room.sortOrder,
      });
    }

    for (const table of visibleTables) {
      if (!map.has(table.zone)) {
        map.set(table.zone, {
          code: table.zone,
          name: formatRoomCodeLabel(table.zone),
          isActive: true,
          sortOrder: 999,
        });
      }
    }

    return [...map.values()].sort((a, b) => {
      const orderDiff = a.sortOrder - b.sortOrder;
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });
  }, [rooms, visibleTables]);

  useEffect(() => {
    if (roomOptions.length === 0) {
      setSelectedRoomCode(null);
      return;
    }
    if (!selectedRoomCode || !roomOptions.some((room) => room.code === selectedRoomCode)) {
      setSelectedRoomCode(roomOptions[0].code);
    }
  }, [roomOptions, selectedRoomCode]);

  const selectedRoom = roomOptions.find((room) => room.code === selectedRoomCode) ?? null;
  const selectedRoomTables = selectedRoomCode
    ? visibleTables.filter((table) => table.zone === selectedRoomCode)
    : [];

  if (summaryLoading || tablesLoading || roomsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const openTableOrderFlow = (table: TableData) => {
    if (table.status !== "Active") {
      return;
    }

    if (
      table.currentOrderId &&
      (table.occupancyStatus === "occupied" || table.occupancyStatus === "payment_pending" || table.occupancyStatus === "paid")
    ) {
      setLocation(`/orders/${table.currentOrderId}`);
      return;
    }
    setLocation(`/orders?tableId=${table.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">{t("dashboard.title")}</h1>
        <Button onClick={() => setLocation("/floor-plan")} className="gap-2">
          {t("dashboard.openFloorPlan")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          title={t("dashboard.todaySales")}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setLocation("/finance")}
        >
          <div className="text-lg font-bold sm:text-2xl">{summary?.todaySales ?? t("dashboard.defaultSales")}</div>
        </SummaryCard>

        <SummaryCard
          title={t("dashboard.activeOrders")}
          icon={<ShoppingBag className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setLocation("/orders")}
        >
          <div className="text-lg font-bold sm:text-2xl">{summary?.activeOrders ?? 0}</div>
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {t("dashboard.totalToday", { count: summary?.todayOrders ?? 0 })}
          </p>
        </SummaryCard>

        <SummaryCard
          title={t("dashboard.availableTables")}
          icon={<MapIcon className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setLocation("/floor-plan")}
        >
          <div className="text-lg font-bold sm:text-2xl">{summary?.availableTables ?? 0}</div>
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {t("dashboard.occupiedPending", {
              occupied: summary?.occupiedTables ?? 0,
              pending: summary?.pendingPaymentTables ?? 0,
            })}
          </p>
        </SummaryCard>

        <SummaryCard
          title={t("dashboard.lowStockItems")}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          onClick={() => setLocation("/inventory")}
        >
          <div className="text-lg font-bold text-destructive sm:text-2xl">{summary?.lowStockItems ?? 0}</div>
        </SummaryCard>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight">{t("dashboard.floorOverview")}</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{t("dashboard.tableCount", { count: visibleTables.length })}</Badge>
            <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title={t("floorPlan.zoomOut")}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-12 text-center text-xs font-semibold">{Math.round(previewZoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title={t("floorPlan.zoomIn")}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset} title={t("floorPlan.resetZoom")}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {roomOptions.map((room) => {
            const selected = room.code === selectedRoomCode;
            return (
              <button
                key={room.code}
                onClick={() => setSelectedRoomCode(room.code)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                  selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"
                }`}
              >
                <span>{room.name}</span>
                {!room.isActive ? <span className="ml-2 text-[11px] opacity-80">({t("floorPlan.roomClosed")})</span> : null}
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selectedRoom?.name ?? t("floorPlan.noRoomSelected")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed bg-muted/20 overflow-auto">
              <div
                className="relative"
                style={{ minWidth: DASHBOARD_CANVAS_WIDTH * previewZoom, minHeight: DASHBOARD_CANVAS_HEIGHT * previewZoom }}
              >
                <div
                  className="absolute left-0 top-0 origin-top-left"
                  style={{ width: DASHBOARD_CANVAS_WIDTH, height: DASHBOARD_CANVAS_HEIGHT, transform: `scale(${previewZoom})` }}
                >
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
                      backgroundSize: "40px 40px",
                    }}
                  />
                  {selectedRoomTables.map((table) => (
                    <FloorPreviewCard key={table.id} table={table} onClick={() => openTableOrderFlow(table)} />
                  ))}
                  {selectedRoomTables.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      {t("dashboard.noTablesInRoom", { room: selectedRoom?.name ?? t("floorPlan.noRoomSelected") })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
