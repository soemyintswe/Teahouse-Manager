import { useState, useEffect, useCallback, useMemo } from "react";
import { useListTables, getListTablesQueryKey, useUpdateTable } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
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
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { listRooms, ROOMS_QUERY_KEY, type RoomRecord } from "@/lib/rooms-api";

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
  { labelKey: string; bg: string; border: string; text: string; dot: string }
> = {
  available: {
    labelKey: "status.occupancy.available",
    bg: "bg-emerald-500",
    border: "border-emerald-700",
    text: "text-white",
    dot: "bg-emerald-300",
  },
  occupied: {
    labelKey: "status.occupancy.occupied",
    bg: "bg-amber-400",
    border: "border-amber-600",
    text: "text-amber-950",
    dot: "bg-amber-300",
  },
  payment_pending: {
    labelKey: "status.occupancy.payment_pending",
    bg: "bg-red-500",
    border: "border-red-700",
    text: "text-white",
    dot: "bg-red-300",
  },
  paid: {
    labelKey: "status.occupancy.paid",
    bg: "bg-blue-500",
    border: "border-blue-700",
    text: "text-white",
    dot: "bg-blue-300",
  },
  dirty: {
    labelKey: "status.occupancy.dirty",
    bg: "bg-slate-500",
    border: "border-slate-700",
    text: "text-white",
    dot: "bg-slate-300",
  },
};

const FLOOR_CANVAS_WIDTH = 620;
const FLOOR_CANVAS_HEIGHT = 350;
const DEFAULT_FLOOR_ZOOM = 0.8;
const TABLE_CARD_WIDTH = 92;
const TABLE_CARD_HEIGHT = 92;

type DragState = {
  tableId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type RoomOption = {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

function formatRoomCodeLabel(code: string): string {
  const normalized = code.trim();
  if (!normalized) return "Room";
  return normalized
    .split("-")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function getCategoryLabel(category: TableData["category"], t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`category.${category}`);
}

function getRoomLabel(
  roomCode: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  roomNameByCode: Map<string, string>,
  short = false,
): string {
  const mapped = roomNameByCode.get(roomCode);
  if (mapped) return mapped;
  if (roomCode === "aircon") return t(short ? "zones.airconShort" : "zones.aircon");
  if (roomCode === "hall") return t(short ? "zones.hallShort" : "zones.hall");
  return formatRoomCodeLabel(roomCode);
}

function TableCard({
  table,
  onClick,
  onPointerDown,
  positionOverride,
  isLayoutEditMode,
  isDragging,
}: {
  table: TableData;
  onClick: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  positionOverride?: { x: number; y: number };
  isLayoutEditMode: boolean;
  isDragging: boolean;
}) {
  const { t } = useTranslation();
  const occupancyConfig = OCCUPANCY_CONFIG[table.occupancyStatus] ?? OCCUPANCY_CONFIG.available;
  const occupancyLabel = t(occupancyConfig.labelKey);
  const isMaintenance = table.status === "Maintenance";

  const baseClass = isMaintenance
    ? `bg-slate-300 border-slate-500 text-slate-100 ${isLayoutEditMode ? "" : "cursor-not-allowed"}`
    : `${occupancyConfig.bg} ${occupancyConfig.border} ${occupancyConfig.text} hover:scale-[1.03]`;

  const card = (
    <button
      data-testid={`table-card-${table.id}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={isMaintenance && !isLayoutEditMode}
      className={`
        absolute w-[74px] h-[74px] sm:w-[92px] sm:h-[92px] rounded-xl border-2 shadow-md
        flex flex-col items-center justify-center gap-1
        transition-all duration-150 select-none
        ${isLayoutEditMode ? "cursor-grab active:cursor-grabbing hover:scale-100 touch-none" : ""}
        ${isDragging ? "ring-2 ring-primary ring-offset-2 z-10" : ""}
        ${baseClass}
      `}
      style={{ left: positionOverride?.x ?? table.posX, top: positionOverride?.y ?? table.posY }}
    >
      {!isMaintenance && (table.occupancyStatus === "occupied" || table.occupancyStatus === "payment_pending" || table.occupancyStatus === "paid") && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${occupancyConfig.dot}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${occupancyConfig.dot}`} />
        </span>
      )}

      {isMaintenance ? <Lock className="absolute top-2 left-2 h-3.5 w-3.5" /> : null}

      <span className="px-1 text-center text-[10px] sm:text-[11px] font-black leading-tight">
        {t("floorPlan.tableLabel", {
          tableNumber: table.tableNumber,
          category: getCategoryLabel(table.category, t),
        })}
      </span>

      <span className="px-1 text-center text-[9px] font-semibold leading-tight">
        {t("floorPlan.capacity", { capacity: table.capacity })}
      </span>

      <div className="flex items-center gap-1 text-[9px] leading-none">
        {table.category === "VIP" ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-yellow-300/90 px-1 py-0.5 text-yellow-950 font-bold">
            <Crown className="h-2.5 w-2.5" /> {t("category.VIP")}
          </span>
        ) : null}
        {table.isBooked ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-blue-200/90 px-1 py-0.5 text-blue-900 font-bold">
            <BookmarkCheck className="h-2.5 w-2.5" /> {t("floorPlan.reserved")}
          </span>
        ) : null}
      </div>

      <span className="text-[8px] font-bold uppercase tracking-wide">
        {isMaintenance ? t("status.service.Maintenance") : occupancyLabel}
      </span>
    </button>
  );

  if (!isMaintenance || isLayoutEditMode) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent>{t("floorPlan.serviceSuspended")}</TooltipContent>
    </Tooltip>
  );
}

function QuickActionMenu({
  table,
  roomNameByCode,
  onClose,
  onStartOrder,
  onCheckout,
  onMarkClean,
}: {
  table: TableData;
  roomNameByCode: Map<string, string>;
  onClose: () => void;
  onStartOrder: () => void;
  onCheckout: () => void;
  onMarkClean: () => void;
}) {
  const { t } = useTranslation();
  const cfg = OCCUPANCY_CONFIG[table.occupancyStatus] ?? OCCUPANCY_CONFIG.available;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/35" onClick={onClose} />
      <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl border bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[360px]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{t("common.quickActions")}</p>
            <h3 className="text-xl font-black">{t("floorPlan.table", { tableNumber: table.tableNumber })}</h3>
            <p className="text-xs text-muted-foreground">
              {t("floorPlan.tableMeta", {
                category: getCategoryLabel(table.category, t),
                capacity: table.capacity,
                zone: getRoomLabel(table.zone, t, roomNameByCode, true),
              })}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted/40" aria-label={t("floorPlan.closeMenu")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {t("floorPlan.tableId", { id: table.id })}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {t(cfg.labelKey)}
          </Badge>
          {table.isBooked ? <Badge className="text-xs bg-blue-500 text-white">{t("floorPlan.reserved")}</Badge> : null}
        </div>

        <div className="mt-4 space-y-2">
          {table.occupancyStatus === "available" ? (
            <Button className="w-full" onClick={onStartOrder}>
              {t("actions.startOrder")}
            </Button>
          ) : null}

          {(table.occupancyStatus === "occupied" || table.occupancyStatus === "paid") ? (
            <Button className="w-full bg-slate-700 text-white hover:bg-slate-800" onClick={onCheckout}>
              {t("actions.checkoutMarkDirty")}
            </Button>
          ) : null}

          {table.occupancyStatus === "payment_pending" ? (
            <>
              <Button className="w-full bg-red-600 text-white hover:bg-red-700" onClick={onStartOrder}>
                <Receipt className="mr-2 h-4 w-4" /> {t("floorPlan.openBillPayment")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("floorPlan.paymentPendingHint")}</p>
            </>
          ) : null}

          {table.occupancyStatus === "dirty" ? (
            <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={onMarkClean}>
              <Sparkles className="mr-2 h-4 w-4" /> {t("actions.markClean")}
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function FloorPlan() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tables, isLoading } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: listRooms,
    staleTime: 15000,
    refetchInterval: 30000,
  });
  const updateTable = useUpdateTable();

  const [statusFilter, setStatusFilter] = useState<keyof typeof OCCUPANCY_CONFIG | null>(null);
  const [floorZoom, setFloorZoom] = useState(DEFAULT_FLOOR_ZOOM);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [savingLayoutTableId, setSavingLayoutTableId] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
      setLastRefreshed(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const handleManualRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
    queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
    setLastRefreshed(new Date());
  }, [queryClient]);

  const visibleTables = useMemo(
    () => ((tables ?? []) as TableData[]).filter((table) => table.status !== "Archived"),
    [tables],
  );

  const clampPosition = useCallback((x: number, y: number) => {
    const maxX = FLOOR_CANVAS_WIDTH - TABLE_CARD_WIDTH;
    const maxY = FLOOR_CANVAS_HEIGHT - TABLE_CARD_HEIGHT;
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }, []);

  useEffect(() => {
    const validIds = new Set(visibleTables.map((table) => table.id));
    setDraftPositions((prev) => {
      const next: Record<number, { x: number; y: number }> = {};
      for (const [idText, pos] of Object.entries(prev)) {
        const id = Number(idText);
        if (validIds.has(id)) next[id] = pos;
      }
      return next;
    });
  }, [visibleTables]);

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

  const roomNameByCode = useMemo(
    () => new Map(roomOptions.map((room) => [room.code, room.name])),
    [roomOptions],
  );
  const roomActiveByCode = useMemo(
    () => new Map(roomOptions.map((room) => [room.code, room.isActive])),
    [roomOptions],
  );

  useEffect(() => {
    if (roomOptions.length === 0) {
      setSelectedRoomCode(null);
      return;
    }
    if (!selectedRoomCode || !roomOptions.some((room) => room.code === selectedRoomCode)) {
      setSelectedRoomCode(roomOptions[0].code);
    }
  }, [roomOptions, selectedRoomCode]);

  const selectedTable = useMemo(
    () => visibleTables.find((table) => table.id === selectedTableId) ?? null,
    [visibleTables, selectedTableId],
  );

  const activeServiceTables = useMemo(
    () => visibleTables.filter((table) => table.status === "Active"),
    [visibleTables],
  );

  const roomTables = useMemo(
    () => (selectedRoomCode ? visibleTables.filter((table) => table.zone === selectedRoomCode) : []),
    [visibleTables, selectedRoomCode],
  );

  const counts = {
    available: activeServiceTables.filter((table) => table.occupancyStatus === "available").length,
    occupied: activeServiceTables.filter((table) => table.occupancyStatus === "occupied").length,
    payment_pending: activeServiceTables.filter((table) => table.occupancyStatus === "payment_pending").length,
    paid: activeServiceTables.filter((table) => table.occupancyStatus === "paid").length,
    dirty: activeServiceTables.filter((table) => table.occupancyStatus === "dirty").length,
  };

  const maintenanceCount = visibleTables.filter((table) => table.status === "Maintenance").length;

  const filteredTables = useMemo(
    () =>
      statusFilter && selectedRoomCode
        ? activeServiceTables.filter(
            (table) => table.occupancyStatus === statusFilter && table.zone === selectedRoomCode,
          )
        : [],
    [statusFilter, selectedRoomCode, activeServiceTables],
  );

  const selectedRoom = useMemo(
    () => roomOptions.find((room) => room.code === selectedRoomCode) ?? null,
    [roomOptions, selectedRoomCode],
  );

  const handleZoomIn = useCallback(() => {
    setFloorZoom((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFloorZoom((prev) => Math.max(0.45, Number((prev - 0.1).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setFloorZoom(DEFAULT_FLOOR_ZOOM);
  }, []);

  const persistTablePosition = useCallback(
    async (tableId: number, x: number, y: number) => {
      const table = visibleTables.find((item) => item.id === tableId);
      if (!table) return;

      try {
        setSavingLayoutTableId(tableId);
        await updateTable.mutateAsync({
          id: tableId,
          data: { posX: x, posY: y },
        });
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({
          title: t("floorPlan.layoutSavedToast", { tableNumber: table.tableNumber }),
        });
      } catch (error) {
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({
          title: t("floorPlan.layoutSaveFailedTitle"),
          description: error instanceof Error ? error.message : t("common.unknownError"),
          variant: "destructive",
        });
      } finally {
        setSavingLayoutTableId(null);
        setDraftPositions((prev) => {
          const next = { ...prev };
          delete next[tableId];
          return next;
        });
      }
    },
    [queryClient, t, toast, updateTable, visibleTables],
  );

  const handleTablePointerDown = useCallback(
    (table: TableData, event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isLayoutEditMode || savingLayoutTableId !== null) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      setSelectedTableId(null);
      const currentPos = draftPositions[table.id] ?? { x: table.posX, y: table.posY };
      setDragState({
        tableId: table.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: currentPos.x,
        startY: currentPos.y,
      });
    },
    [draftPositions, isLayoutEditMode, savingLayoutTableId],
  );

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (event: PointerEvent) => {
      const dx = (event.clientX - dragState.startClientX) / floorZoom;
      const dy = (event.clientY - dragState.startClientY) / floorZoom;
      const next = clampPosition(dragState.startX + dx, dragState.startY + dy);
      setDraftPositions((prev) => ({ ...prev, [dragState.tableId]: next }));
    };

    const onPointerUp = () => {
      const current = draftPositions[dragState.tableId] ?? { x: dragState.startX, y: dragState.startY };
      const moved = Math.abs(current.x - dragState.startX) > 0.5 || Math.abs(current.y - dragState.startY) > 0.5;
      const tableId = dragState.tableId;
      setDragState(null);

      if (!moved) {
        setDraftPositions((prev) => {
          const next = { ...prev };
          delete next[tableId];
          return next;
        });
        return;
      }

      void persistTablePosition(tableId, Math.round(current.x), Math.round(current.y));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [clampPosition, dragState, draftPositions, floorZoom, persistTablePosition]);

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
        toast({
          title: t("floorPlan.updatedToast", {
            tableNumber: table.tableNumber,
            status: t(OCCUPANCY_CONFIG[next].labelKey),
          }),
        });
        setSelectedTableId(null);
      } catch (error) {
        toast({
          title: t("floorPlan.failedUpdateTitle"),
          description: error instanceof Error ? error.message : t("common.unknownError"),
          variant: "destructive",
        });
      }
    },
    [updateTable, queryClient, toast, t],
  );

  const handleTableClick = useCallback((table: TableData) => {
    if (isLayoutEditMode) {
      return;
    }
    if (table.status !== "Active") {
      return;
    }
    if (roomActiveByCode.get(table.zone) === false) {
      return;
    }
    setSelectedTableId(table.id);
  }, [isLayoutEditMode, roomActiveByCode]);

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

  if (isLoading || roomsLoading) {
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
          <h1 className="page-title">{t("floorPlan.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("floorPlan.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 text-sm font-medium">
            {Object.entries(OCCUPANCY_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`h-3.5 w-3.5 rounded-full ${cfg.bg}`} />
                <span className="text-muted-foreground">{t(cfg.labelKey)}</span>
                <span className="font-bold text-foreground">{counts[key as keyof typeof counts]}</span>
              </div>
            ))}
            <Badge variant="outline" className="ml-1">
              {t("floorPlan.maintenanceCount", { count: maintenanceCount })}
            </Badge>
          </div>

          <Button variant="outline" size="sm" onClick={handleManualRefresh} data-testid="btn-refresh" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </Button>

          <Button
            variant={isLayoutEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSelectedTableId(null);
              setDragState(null);
              setDraftPositions({});
              setIsLayoutEditMode((prev) => !prev);
            }}
            disabled={savingLayoutTableId !== null}
          >
            {isLayoutEditMode ? t("floorPlan.exitLayoutEdit") : t("floorPlan.editLayout")}
          </Button>

          <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title={t("floorPlan.zoomOut")}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-12 text-center text-xs font-semibold">{Math.round(floorZoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title={t("floorPlan.zoomIn")}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset} title={t("floorPlan.resetZoom")}>
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
              <p className="text-xs text-muted-foreground truncate mt-0.5">{t(cfg.labelKey)}</p>
            </div>
          </button>
        ))}
      </div>

      {statusFilter && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">
                {t("floorPlan.availableTablesTitle", {
                  status: t(OCCUPANCY_CONFIG[statusFilter].labelKey),
                  count: filteredTables.length,
                })}
              </h2>
              <p className="text-sm text-muted-foreground">{t("floorPlan.filteredSubtitle")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStatusFilter(null)}>
              {t("common.clearFilter")}
            </Button>
          </div>
          {filteredTables.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("floorPlan.noTablesForStatus")}
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
                      {t("floorPlan.tableLabel", {
                        tableNumber: table.tableNumber,
                        category: getCategoryLabel(table.category, t),
                      })}{" "}
                      {t("floorPlan.capacity", { capacity: table.capacity })}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {getRoomLabel(table.zone, t, roomNameByCode, true)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("common.id")} #{table.id} {table.isBooked ? `· ${t("floorPlan.reserved")}` : ""}
                  </p>
                  {table.currentOrderId ? (
                    <p className="mt-1 text-xs font-medium text-primary">{t("floorPlan.order", { id: table.currentOrderId })}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">{t("floorPlan.noActiveOrder")}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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

      {isLayoutEditMode ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          {savingLayoutTableId !== null
            ? t("floorPlan.layoutSaving")
            : t("floorPlan.layoutEditHint")}
        </div>
      ) : null}

      <div className="flex-1 min-h-0">
        <div className="flex items-center gap-2 mb-2 flex-shrink-0">
          <div className="h-0.5 flex-1 bg-border" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2">
            {selectedRoom ? selectedRoom.name : t("floorPlan.noRoomSelected")}
          </span>
          <div className="h-0.5 flex-1 bg-border" />
        </div>

        <div className="h-full rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-auto" data-testid="zone-selected-room">
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
              {roomTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  onClick={() => handleTableClick(table)}
                  onPointerDown={(event) => handleTablePointerDown(table, event)}
                  positionOverride={draftPositions[table.id]}
                  isLayoutEditMode={isLayoutEditMode}
                  isDragging={dragState?.tableId === table.id}
                />
              ))}
              {roomTables.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                  {t("floorPlan.noTablesInSelectedRoom")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedTable ? (
        <QuickActionMenu
          table={selectedTable}
          roomNameByCode={roomNameByCode}
          onClose={() => setSelectedTableId(null)}
          onStartOrder={() => handleStartOrder(selectedTable)}
          onCheckout={() => updateOccupancy(selectedTable, "dirty", true)}
          onMarkClean={() => updateOccupancy(selectedTable, "available", true)}
        />
      ) : null}
    </div>
  );
}
