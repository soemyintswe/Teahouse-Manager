import { useState, useEffect, useCallback, useMemo } from "react";
import { useListTables, getListTablesQueryKey, useUpdateTable } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  Clock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crown,
  BookmarkCheck,
  Lock,
  X,
  Sparkles,
  Receipt,
} from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

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
  qrCode?: string | null;
  createdAt: string;
  updatedAt: string;
};

const OCCUPANCY_CONFIG: Record<
  TableData["occupancyStatus"],
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  available: {
    label: "Available",
    bg: "bg-emerald-500",
    border: "border-emerald-700",
    text: "text-white",
    dot: "bg-emerald-300",
  },
  occupied: {
    label: "Occupied",
    bg: "bg-amber-400",
    border: "border-amber-600",
    text: "text-amber-950",
    dot: "bg-amber-300",
  },
  payment_pending: {
    label: "Payment Pending",
    bg: "bg-red-500",
    border: "border-red-700",
    text: "text-white",
    dot: "bg-red-300",
  },
  paid: {
    label: "Paid",
    bg: "bg-blue-500",
    border: "border-blue-700",
    text: "text-white",
    dot: "bg-blue-300",
  },
  dirty: {
    label: "Dirty",
    bg: "bg-slate-500",
    border: "border-slate-700",
    text: "text-white",
    dot: "bg-slate-300",
  },
};

const FLOOR_CANVAS_WIDTH = 620;
const FLOOR_CANVAS_HEIGHT = 350;
const DEFAULT_FLOOR_ZOOM = 0.8;

function TableCard({ table, onClick }: { table: TableData; onClick: () => void }) {
  const occupancyConfig = OCCUPANCY_CONFIG[table.occupancyStatus] ?? OCCUPANCY_CONFIG.available;
  const isMaintenance = table.status === "Maintenance";

  const baseClass = isMaintenance
    ? "bg-slate-300 border-slate-500 text-slate-100 cursor-not-allowed"
    : `${occupancyConfig.bg} ${occupancyConfig.border} ${occupancyConfig.text} hover:scale-[1.03]`;

  const card = (
    <button
      data-testid={`table-card-${table.id}`}
      onClick={onClick}
      disabled={isMaintenance}
      className={`
        absolute w-[74px] h-[74px] sm:w-[92px] sm:h-[92px] rounded-xl border-2 shadow-md
        flex flex-col items-center justify-center gap-1
        transition-all duration-150 select-none
        ${baseClass}
      `}
      style={{ left: table.posX, top: table.posY }}
    >
      {!isMaintenance && (table.occupancyStatus === "occupied" || table.occupancyStatus === "payment_pending" || table.occupancyStatus === "paid") && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${occupancyConfig.dot}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${occupancyConfig.dot}`} />
        </span>
      )}

      {isMaintenance ? <Lock className="absolute top-2 left-2 h-3.5 w-3.5" /> : null}

      <span className="px-1 text-center text-[10px] sm:text-[11px] font-black leading-tight">
        {table.tableNumber} - {table.category}
      </span>

      <span className="px-1 text-center text-[9px] font-semibold leading-tight">(Cap: {table.capacity})</span>

      <div className="flex items-center gap-1 text-[9px] leading-none">
        {table.category === "VIP" ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-yellow-300/90 px-1 py-0.5 text-yellow-950 font-bold">
            <Crown className="h-2.5 w-2.5" /> VIP
          </span>
        ) : null}
        {table.isBooked ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-blue-200/90 px-1 py-0.5 text-blue-900 font-bold">
            <BookmarkCheck className="h-2.5 w-2.5" /> Reserved
          </span>
        ) : null}
      </div>

      <span className="text-[8px] font-bold uppercase tracking-wide">
        {isMaintenance ? "Maintenance" : occupancyConfig.label}
      </span>
    </button>
  );

  if (!isMaintenance) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent>Service Suspended</TooltipContent>
    </Tooltip>
  );
}

function QuickActionMenu({
  table,
  onClose,
  onStartOrder,
  onCheckout,
  onMarkClean,
}: {
  table: TableData;
  onClose: () => void;
  onStartOrder: () => void;
  onCheckout: () => void;
  onMarkClean: () => void;
}) {
  const cfg = OCCUPANCY_CONFIG[table.occupancyStatus] ?? OCCUPANCY_CONFIG.available;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/35" onClick={onClose} />
      <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl border bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[360px]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Quick Actions</p>
            <h3 className="text-xl font-black">
              Table {table.tableNumber}
            </h3>
            <p className="text-xs text-muted-foreground">
              {table.category} · Cap {table.capacity} · {table.zone === "aircon" ? "Air-con" : "Hall"}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted/40" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Badge variant="outline" className="text-xs">ID #{table.id}</Badge>
          <Badge variant="outline" className="text-xs">{cfg.label}</Badge>
          {table.isBooked ? <Badge className="text-xs bg-blue-500 text-white">Reserved</Badge> : null}
        </div>

        <div className="mt-4 space-y-2">
          {table.occupancyStatus === "available" ? (
            <Button className="w-full" onClick={onStartOrder}>
              Start Order
            </Button>
          ) : null}

          {(table.occupancyStatus === "occupied" || table.occupancyStatus === "paid") ? (
            <Button className="w-full bg-slate-700 text-white hover:bg-slate-800" onClick={onCheckout}>
              Checkout (Mark as Dirty)
            </Button>
          ) : null}

          {table.occupancyStatus === "payment_pending" ? (
            <>
              <Button
                className="w-full bg-red-600 text-white hover:bg-red-700"
                onClick={onStartOrder}
              >
                <Receipt className="mr-2 h-4 w-4" /> Open Bill / Payment
              </Button>
              <p className="text-xs text-muted-foreground">
                Bill requested. Once payment is confirmed, status will move to Paid automatically.
              </p>
            </>
          ) : null}

          {table.occupancyStatus === "dirty" ? (
            <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={onMarkClean}>
              <Sparkles className="mr-2 h-4 w-4" /> Mark as Clean
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function FloorPlan() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tables, isLoading } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const updateTable = useUpdateTable();

  const [statusFilter, setStatusFilter] = useState<keyof typeof OCCUPANCY_CONFIG | null>(null);
  const [floorZoom, setFloorZoom] = useState(DEFAULT_FLOOR_ZOOM);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      setLastRefreshed(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const handleManualRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
    setLastRefreshed(new Date());
  }, [queryClient]);

  const visibleTables = useMemo(
    () => ((tables ?? []) as TableData[]).filter((table) => table.status !== "Archived"),
    [tables],
  );

  const selectedTable = useMemo(
    () => visibleTables.find((table) => table.id === selectedTableId) ?? null,
    [visibleTables, selectedTableId],
  );

  const activeServiceTables = useMemo(
    () => visibleTables.filter((table) => table.status === "Active"),
    [visibleTables],
  );

  const hallTables = useMemo(
    () => visibleTables.filter((table) => table.zone === "hall"),
    [visibleTables],
  );

  const airconTables = useMemo(
    () => visibleTables.filter((table) => table.zone === "aircon"),
    [visibleTables],
  );

  const counts = {
    available: activeServiceTables.filter((table) => table.occupancyStatus === "available").length,
    occupied: activeServiceTables.filter((table) => table.occupancyStatus === "occupied").length,
    payment_pending: activeServiceTables.filter((table) => table.occupancyStatus === "payment_pending").length,
    paid: activeServiceTables.filter((table) => table.occupancyStatus === "paid").length,
    dirty: activeServiceTables.filter((table) => table.occupancyStatus === "dirty").length,
  };

  const maintenanceCount = visibleTables.filter((table) => table.status === "Maintenance").length;

  const filteredTables = statusFilter
    ? activeServiceTables.filter((table) => table.occupancyStatus === statusFilter)
    : [];

  const handleZoomIn = useCallback(() => {
    setFloorZoom((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFloorZoom((prev) => Math.max(0.45, Number((prev - 0.1).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setFloorZoom(DEFAULT_FLOOR_ZOOM);
  }, []);

  const updateOccupancy = useCallback(
    async (table: TableData, next: TableData["occupancyStatus"], clearOrder = false) => {
      try {
        await updateTable.mutateAsync({
          id: table.id,
          data: {
            occupancyStatus: next,
            currentOrderId: clearOrder ? null : table.currentOrderId,
          },
        });
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({ title: `Table ${table.tableNumber} -> ${OCCUPANCY_CONFIG[next].label}` });
        setSelectedTableId(null);
      } catch (error) {
        toast({
          title: "Failed to update table",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [updateTable, queryClient, toast],
  );

  const handleTableClick = useCallback((table: TableData) => {
    if (table.status !== "Active") {
      return;
    }
    setSelectedTableId(table.id);
  }, []);

  const handleStartOrder = useCallback((table: TableData) => {
    if (table.occupancyStatus === "payment_pending" && table.currentOrderId) {
      setLocation(`/cashier?orderId=${table.currentOrderId}`);
      setSelectedTableId(null);
      return;
    }

    if (table.currentOrderId && (table.occupancyStatus === "occupied" || table.occupancyStatus === "paid")) {
      setLocation(`/orders/${table.currentOrderId}`);
      setSelectedTableId(null);
      return;
    }

    setLocation(`/orders?tableId=${table.id}`);
    setSelectedTableId(null);
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tap a table for quick actions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 text-sm font-medium">
            {Object.entries(OCCUPANCY_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`h-3.5 w-3.5 rounded-full ${cfg.bg}`} />
                <span className="text-muted-foreground">{cfg.label}</span>
                <span className="font-bold text-foreground">{counts[key as keyof typeof counts]}</span>
              </div>
            ))}
            <Badge variant="outline" className="ml-1">
              Maintenance {maintenanceCount}
            </Badge>
          </div>

          <Button variant="outline" size="sm" onClick={handleManualRefresh} data-testid="btn-refresh" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </Button>

          <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-12 text-center text-xs font-semibold">{Math.round(floorZoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset} title="Reset zoom">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(OCCUPANCY_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 ${
              statusFilter === key ? "border-primary bg-primary/10" : "bg-card"
            }`}
            data-testid={`summary-${key}`}
            onClick={() => setStatusFilter((prev) => (prev === key ? null : (key as keyof typeof OCCUPANCY_CONFIG)))}
          >
            <div className={`h-3 w-3 rounded-full flex-shrink-0 ${cfg.bg}`} />
            <div className="min-w-0">
              <p className="text-2xl font-black text-foreground leading-none">{counts[key as keyof typeof counts]}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{cfg.label}</p>
            </div>
          </button>
        ))}
      </div>

      {statusFilter && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">
                {OCCUPANCY_CONFIG[statusFilter].label} Tables ({filteredTables.length})
              </h2>
              <p className="text-sm text-muted-foreground">Tap a row to open quick actions.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStatusFilter(null)}>
              Clear Filter
            </Button>
          </div>
          {filteredTables.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No tables found for this status.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTables.map((table) => (
                <button
                  key={table.id}
                  className="rounded-md border p-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => handleTableClick(table)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">
                      {table.tableNumber} - {table.category} (Cap: {table.capacity})
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {table.zone === "aircon" ? "Air-con" : "Hall"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ID #{table.id} {table.isBooked ? "· Reserved" : ""}
                  </p>
                  {table.currentOrderId ? (
                    <p className="mt-1 text-xs font-medium text-primary">Order #{table.currentOrderId}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No active order</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 gap-5 lg:grid-cols-2 min-h-0">
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <div className="h-0.5 flex-1 bg-border" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2">Hall Zone</span>
            <div className="h-0.5 flex-1 bg-border" />
          </div>
          <div className="flex-1 rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-auto" data-testid="zone-hall">
            <div className="relative" style={{ minWidth: FLOOR_CANVAS_WIDTH * floorZoom, minHeight: FLOOR_CANVAS_HEIGHT * floorZoom }}>
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{ width: FLOOR_CANVAS_WIDTH, height: FLOOR_CANVAS_HEIGHT, transform: `scale(${floorZoom})` }}
              >
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
                {hallTables.map((table) => (
                  <TableCard key={table.id} table={table} onClick={() => handleTableClick(table)} />
                ))}
                {hallTables.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                    No tables in Hall
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <div className="h-0.5 flex-1 bg-blue-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 px-2">Air-con Room</span>
            <div className="h-0.5 flex-1 bg-blue-200" />
          </div>
          <div className="flex-1 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 overflow-auto" data-testid="zone-aircon">
            <div className="relative" style={{ minWidth: FLOOR_CANVAS_WIDTH * floorZoom, minHeight: FLOOR_CANVAS_HEIGHT * floorZoom }}>
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{ width: FLOOR_CANVAS_WIDTH, height: FLOOR_CANVAS_HEIGHT, transform: `scale(${floorZoom})` }}
              >
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: "radial-gradient(circle, #93c5fd 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
                <div className="absolute top-3 right-3 text-blue-300">
                  <Clock className="w-5 h-5" />
                </div>
                {airconTables.map((table) => (
                  <TableCard key={table.id} table={table} onClick={() => handleTableClick(table)} />
                ))}
                {airconTables.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-blue-400 text-sm">
                    No tables in Air-con Room
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedTable ? (
        <QuickActionMenu
          table={selectedTable}
          onClose={() => setSelectedTableId(null)}
          onStartOrder={() => handleStartOrder(selectedTable)}
          onCheckout={() => updateOccupancy(selectedTable, "dirty", true)}
          onMarkClean={() => updateOccupancy(selectedTable, "available", true)}
        />
      ) : null}
    </div>
  );
}
