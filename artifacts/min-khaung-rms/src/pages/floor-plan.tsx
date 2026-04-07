import { useState, useEffect, useCallback } from "react";
import { useListTables, getListTablesQueryKey, useUpdateTable } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users, Clock, Circle, X, ChefHat, CreditCard, Sparkles, PlusCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type TableData = {
  id: number;
  tableNumber: string;
  zone: string;
  capacity: number;
  status: string;
  posX: number;
  posY: number;
  currentOrderId: number | null;
  qrCode?: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  available:       { label: "Available",       bg: "bg-emerald-500",  border: "border-emerald-700", text: "text-white",      dot: "bg-emerald-400" },
  occupied:        { label: "Occupied",         bg: "bg-amber-400",   border: "border-amber-600",  text: "text-amber-950",  dot: "bg-amber-300"  },
  payment_pending: { label: "Payment Pending",  bg: "bg-red-500",     border: "border-red-700",    text: "text-white",      dot: "bg-red-300"    },
  dirty:           { label: "Cleaning",         bg: "bg-slate-400",   border: "border-slate-600",  text: "text-white",      dot: "bg-slate-300"  },
};

function TableCard({
  table,
  selected,
  onClick,
}: {
  table: TableData;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.available;
  return (
    <button
      data-testid={`table-card-${table.id}`}
      onClick={onClick}
      className={`
        absolute w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 shadow-md
        flex flex-col items-center justify-center gap-1
        transition-all duration-150 select-none
        ${cfg.bg} ${cfg.border} ${cfg.text}
        ${selected ? "ring-4 ring-white ring-offset-2 scale-110 z-20 shadow-xl" : "hover:scale-105 hover:shadow-lg z-10"}
      `}
      style={{ left: table.posX, top: table.posY }}
    >
      {/* Pulse dot for occupied / payment_pending */}
      {(table.status === "occupied" || table.status === "payment_pending") && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.dot}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
        </span>
      )}
      <span className="font-extrabold text-lg sm:text-xl leading-none tracking-tight">{table.tableNumber}</span>
      <span className="text-[11px] font-medium opacity-90 flex items-center gap-0.5">
        <Users className="w-3 h-3" /> {table.capacity}
      </span>
      {table.status !== "available" && (
        <span className="text-[10px] opacity-80 font-semibold uppercase tracking-wide leading-none">
          {STATUS_CONFIG[table.status]?.label ?? table.status}
        </span>
      )}
    </button>
  );
}

function TablePanel({
  table,
  onClose,
  onStatusChange,
}: {
  table: TableData;
  onClose: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [, setLocation] = useLocation();
  const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.available;

  const statusActions: { status: string; label: string; icon: React.ReactNode; color: string }[] = [
    { status: "available", label: "Mark Available",       icon: <Circle className="w-4 h-4" />,      color: "text-emerald-600 border-emerald-300 hover:bg-emerald-50" },
    { status: "dirty",     label: "Mark Cleaning",        icon: <Sparkles className="w-4 h-4" />,    color: "text-slate-600 border-slate-300 hover:bg-slate-50" },
  ];

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-80 bg-background border-l shadow-2xl flex flex-col"
      data-testid="table-panel"
    >
      {/* Header */}
      <div className={`${cfg.bg} ${cfg.text} p-5 flex items-start justify-between`}>
        <div>
          <p className="text-sm font-medium opacity-80 uppercase tracking-widest">
            {table.zone === "aircon" ? "Air-con Room" : "Hall Zone"}
          </p>
          <h2 className="text-3xl font-black leading-none mt-1">Table {table.tableNumber}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm opacity-90">
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {table.capacity} seats</span>
            {table.zone === "aircon" && (
              <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                Aircon Fee
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="opacity-80 hover:opacity-100 p-1 rounded"
          data-testid="panel-close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status Badge */}
      <div className="px-5 py-4 border-b">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Status</p>
        <Badge
          variant="outline"
          className={`text-sm font-bold px-3 py-1 ${
            table.status === "available" ? "border-emerald-400 text-emerald-700 bg-emerald-50" :
            table.status === "occupied"  ? "border-amber-400 text-amber-700 bg-amber-50" :
            table.status === "payment_pending" ? "border-red-400 text-red-700 bg-red-50" :
            "border-slate-400 text-slate-700 bg-slate-50"
          }`}
        >
          {cfg.label}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Order Actions */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">Order Actions</p>
          <div className="space-y-2">
            {table.status === "available" && (
              <Button
                className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => { setLocation(`/orders?tableId=${table.id}`); onClose(); }}
                data-testid="btn-new-order"
              >
                <PlusCircle className="w-4 h-4" />
                New Order
              </Button>
            )}

            {(table.status === "occupied" || table.status === "payment_pending") && table.currentOrderId && (
              <>
                <Button
                  className="w-full justify-start gap-2"
                  variant="outline"
                  onClick={() => { setLocation(`/orders/${table.currentOrderId}`); onClose(); }}
                  data-testid="btn-view-order"
                >
                  <ChefHat className="w-4 h-4" />
                  View Order #{table.currentOrderId}
                </Button>
                <Button
                  className="w-full justify-start gap-2 bg-red-500 text-white hover:bg-red-600"
                  onClick={() => { setLocation(`/cashier?orderId=${table.currentOrderId}`); onClose(); }}
                  data-testid="btn-pay"
                >
                  <CreditCard className="w-4 h-4" />
                  Process Payment
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status Change */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">Change Status</p>
          <div className="space-y-2">
            {statusActions
              .filter(a => a.status !== table.status)
              .map(a => (
                <button
                  key={a.status}
                  onClick={() => onStatusChange(a.status)}
                  data-testid={`btn-status-${a.status}`}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${a.color}`}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
          </div>
        </div>

        {/* Table Info */}
        <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
          <p className="font-semibold text-foreground mb-1">Table Info</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Zone</span>
            <span className="font-medium text-foreground capitalize">{table.zone === "aircon" ? "Air-con Room" : "Hall"}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Capacity</span>
            <span className="font-medium text-foreground">{table.capacity} seats</span>
          </div>
          {table.currentOrderId && (
            <div className="flex justify-between text-muted-foreground">
              <span>Current Order</span>
              <span className="font-medium text-foreground">#{table.currentOrderId}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Table ID</span>
            <span className="font-medium text-foreground">#{table.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FloorPlan() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tables, isLoading, dataUpdatedAt } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const updateTable = useUpdateTable();
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [statusFilter, setStatusFilter] = useState<keyof typeof STATUS_CONFIG | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      setLastRefreshed(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  // Update selected table when data refreshes
  useEffect(() => {
    if (selectedTable && tables) {
      const updated = tables.find(t => t.id === selectedTable.id);
      if (updated) setSelectedTable(updated as TableData);
    }
  }, [dataUpdatedAt]);

  const handleManualRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
    setLastRefreshed(new Date());
  }, [queryClient]);

  const handleStatusChange = useCallback(async (table: TableData, newStatus: string) => {
    try {
      await updateTable.mutateAsync({ id: table.id, data: { status: newStatus } });
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: `Table ${table.tableNumber} -> ${STATUS_CONFIG[newStatus]?.label ?? newStatus}` });
      setSelectedTable(prev => prev ? { ...prev, status: newStatus } : null);
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  }, [updateTable, queryClient, toast]);

  const handleTableClick = useCallback((table: TableData) => {
    if (table.currentOrderId && (table.status === "occupied" || table.status === "payment_pending")) {
      setLocation(`/orders/${table.currentOrderId}`);
      return;
    }
    setLocation(`/orders?tableId=${table.id}`);
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hallTables  = (tables ?? []).filter(t => t.zone === "hall")   as TableData[];
  const airconTables = (tables ?? []).filter(t => t.zone === "aircon") as TableData[];

  const counts = {
    available:       (tables ?? []).filter(t => t.status === "available").length,
    occupied:        (tables ?? []).filter(t => t.status === "occupied").length,
    payment_pending: (tables ?? []).filter(t => t.status === "payment_pending").length,
    dirty:           (tables ?? []).filter(t => t.status === "dirty").length,
  };
  const filteredTables = statusFilter
    ? ((tables ?? []).filter((table) => table.status === statusFilter) as TableData[])
    : [];

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tap a table to open ordering flow
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3 text-sm font-medium">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-3.5 h-3.5 rounded-full ${cfg.bg}`} />
                <span className="text-muted-foreground">{cfg.label}</span>
                <span className="font-bold text-foreground">{counts[key as keyof typeof counts]}</span>
              </div>
            ))}
          </div>
          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={updateTable.isPending}
            data-testid="btn-refresh"
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updateTable.isPending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 flex-shrink-0">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 ${
              statusFilter === key ? "border-primary bg-primary/10" : "bg-card"
            }`}
            data-testid={`summary-${key}`}
            onClick={() =>
              setStatusFilter((prev) => (prev === key ? null : (key as keyof typeof STATUS_CONFIG)))
            }
          >
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.bg}`} />
            <div className="min-w-0">
              <p className="text-2xl font-black text-foreground leading-none">
                {counts[key as keyof typeof counts]}
              </p>
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
                {STATUS_CONFIG[statusFilter].label} Tables ({filteredTables.length})
              </h2>
              <p className="text-sm text-muted-foreground">Tap a row to open related order flow.</p>
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
                    <p className="font-bold">Table {table.tableNumber}</p>
                    <Badge variant="outline" className="text-xs">
                      {table.zone === "aircon" ? "Air-con" : "Hall"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{table.capacity} seats</p>
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

      {/* Floor map */}
      <div className="flex-1 grid grid-cols-1 gap-5 lg:grid-cols-2 min-h-0">

        {/* Hall Zone */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <div className="h-0.5 flex-1 bg-border" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2">
              Hall Zone
            </span>
            <div className="h-0.5 flex-1 bg-border" />
          </div>
          <div className="flex-1 rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-auto" data-testid="zone-hall">
            <div className="relative" style={{ minWidth: 620, minHeight: 350 }}>
              {/* Grid pattern */}
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              {hallTables.map(table => (
                <TableCard
                  key={table.id}
                  table={table}
                  selected={selectedTable?.id === table.id}
                  onClick={() => handleTableClick(table)}
                />
              ))}
              {hallTables.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                  No tables in Hall
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Air-con Zone */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <div className="h-0.5 flex-1 bg-blue-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 px-2">
              Air-con Room
            </span>
            <div className="h-0.5 flex-1 bg-blue-200" />
          </div>
          <div className="flex-1 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 overflow-auto" data-testid="zone-aircon">
            <div className="relative" style={{ minWidth: 620, minHeight: 350 }}>
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: "radial-gradient(circle, #93c5fd 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              {/* Aircon icon */}
              <div className="absolute top-3 right-3 text-blue-300">
                <Clock className="w-5 h-5" />
              </div>
              {airconTables.map(table => (
                <TableCard
                  key={table.id}
                  table={table}
                  selected={selectedTable?.id === table.id}
                  onClick={() => handleTableClick(table)}
                />
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

      {/* Side panel */}
      {selectedTable && (
        <>
          {/* Backdrop (click to close) */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setSelectedTable(null)}
          />
          <TablePanel
            table={selectedTable}
            onClose={() => setSelectedTable(null)}
            onStatusChange={(status) => handleStatusChange(selectedTable, status)}
          />
        </>
      )}
    </div>
  );
}
