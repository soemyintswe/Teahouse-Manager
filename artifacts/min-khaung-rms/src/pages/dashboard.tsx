import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useListTables,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useCallback, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, ShoppingBag, Map as MapIcon, AlertTriangle, ArrowRight, Users, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

type TableData = {
  id: number;
  tableNumber: string;
  zone: string;
  capacity: number;
  status: string;
  posX: number;
  posY: number;
  currentOrderId: number | null;
};

const TABLE_STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-500 text-white border-emerald-700",
  occupied: "bg-amber-400 text-amber-950 border-amber-600",
  payment_pending: "bg-red-500 text-white border-red-700",
  dirty: "bg-slate-400 text-white border-slate-600",
};

const DASHBOARD_CANVAS_WIDTH = 620;
const DASHBOARD_CANVAS_HEIGHT = 320;
const DEFAULT_DASHBOARD_ZOOM = 0.8;

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>{children}</CardContent>
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
  const styleClass = TABLE_STATUS_STYLE[table.status] ?? TABLE_STATUS_STYLE.available;
  return (
    <button
      onClick={onClick}
      className={`absolute h-16 w-16 rounded-lg border-2 text-center shadow-md transition-all hover:scale-105 sm:h-20 sm:w-20 ${styleClass}`}
      style={{ left: table.posX, top: table.posY }}
    >
      <div className="pt-1.5 text-base font-black leading-none">{table.tableNumber}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-[10px] opacity-90">
        <Users className="h-3 w-3" />
        {table.capacity}
      </div>
    </button>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [previewZoom, setPreviewZoom] = useState(DEFAULT_DASHBOARD_ZOOM);

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: tables = [], isLoading: tablesLoading } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
  });

  if (summaryLoading || tablesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hallTables = (tables as TableData[]).filter((table) => table.zone === "hall");
  const airconTables = (tables as TableData[]).filter((table) => table.zone === "aircon");

  const openTableOrderFlow = (table: TableData) => {
    if (table.currentOrderId && (table.status === "occupied" || table.status === "payment_pending")) {
      setLocation(`/orders/${table.currentOrderId}`);
      return;
    }
    setLocation(`/orders?tableId=${table.id}`);
  };

  const handleZoomIn = useCallback(() => {
    setPreviewZoom((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPreviewZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setPreviewZoom(DEFAULT_DASHBOARD_ZOOM);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <Button onClick={() => setLocation("/floor-plan")} className="gap-2">
          Open Floor Plan
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Today's Sales"
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setLocation("/finance")}
        >
          <div className="text-2xl font-bold">{summary?.todaySales ?? "Ks 0"}</div>
        </SummaryCard>

        <SummaryCard
          title="Active Orders"
          icon={<ShoppingBag className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setLocation("/orders")}
        >
          <div className="text-2xl font-bold">{summary?.activeOrders ?? 0}</div>
          <p className="text-xs text-muted-foreground">Total today: {summary?.todayOrders ?? 0}</p>
        </SummaryCard>

        <SummaryCard
          title="Available Tables"
          icon={<MapIcon className="h-4 w-4 text-muted-foreground" />}
          onClick={() => setLocation("/floor-plan")}
        >
          <div className="text-2xl font-bold">{summary?.availableTables ?? 0}</div>
          <p className="text-xs text-muted-foreground">
            {summary?.occupiedTables ?? 0} occupied, {summary?.pendingPaymentTables ?? 0} pending
          </p>
        </SummaryCard>

        <SummaryCard
          title="Low Stock Items"
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          onClick={() => setLocation("/inventory")}
        >
          <div className="text-2xl font-bold text-destructive">{summary?.lowStockItems ?? 0}</div>
        </SummaryCard>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight">Floor Plan Overview</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{tables.length} tables</Badge>
            <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-12 text-center text-xs font-semibold">{Math.round(previewZoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset} title="Reset zoom">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hall Zone</CardTitle>
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
                    {hallTables.map((table) => (
                      <FloorPreviewCard key={table.id} table={table} onClick={() => openTableOrderFlow(table)} />
                    ))}
                    {hallTables.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        No tables in hall zone
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Air-con Room</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed bg-blue-50/40 overflow-auto">
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
                        backgroundImage: "radial-gradient(circle, #93c5fd 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                      }}
                    />
                    {airconTables.map((table) => (
                      <FloorPreviewCard key={table.id} table={table} onClick={() => openTableOrderFlow(table)} />
                    ))}
                    {airconTables.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        No tables in air-con room
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
