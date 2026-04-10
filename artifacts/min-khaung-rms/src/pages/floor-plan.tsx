import { useState, useEffect, useCallback, useMemo } from "react";
import { useListTables, getListTablesQueryKey, useUpdateTable, useCreateTable, customFetch } from "@workspace/api-client-react";
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
  Copy,
  Check,
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

type SimpleOrder = {
  id: number;
  status: string;
  tableId: number;
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
  tableIds: number[];
  anchorTableId: number;
  cloneMode: boolean;
  startClientX: number;
  startClientY: number;
  startPositions: Record<number, { x: number; y: number }>;
};

type RoomOption = {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type AlignAction =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "middle"
  | "distribute_horizontal"
  | "distribute_vertical";

const ALIGN_LABEL_KEY: Record<AlignAction, string> = {
  top: "floorPlan.align.top",
  bottom: "floorPlan.align.bottom",
  left: "floorPlan.align.left",
  right: "floorPlan.align.right",
  center: "floorPlan.align.center",
  middle: "floorPlan.align.middle",
  distribute_horizontal: "floorPlan.align.distributeHorizontal",
  distribute_vertical: "floorPlan.align.distributeVertical",
};

function formatRoomCodeLabel(code: string): string {
  const normalized = code.trim();
  if (!normalized) return "Room";
  return normalized
    .split("-")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function getNextTableNumber(baseTableNumber: string, existingTableNumbers: Set<string>): string {
  const base = baseTableNumber.trim();
  const tailNumberMatch = /^(.*?)(\d+)$/.exec(base);

  if (tailNumberMatch) {
    const [, prefix, numberText] = tailNumberMatch;
    let nextNumber = Number.parseInt(numberText, 10) + 1;
    while (existingTableNumbers.has(`${prefix}${nextNumber}`)) {
      nextNumber += 1;
    }
    return `${prefix}${nextNumber}`;
  }

  let candidate = `${base}-copy`;
  let count = 2;
  while (existingTableNumbers.has(candidate)) {
    candidate = `${base}-copy-${count}`;
    count += 1;
  }
  return candidate;
}

function splitTableNumber(value: string): { prefix: string; number: number | null; suffix: string } {
  const trimmed = value.trim().toUpperCase();
  const match = /^([A-Z]+)?(\d+)?(.*)$/.exec(trimmed);
  if (!match) return { prefix: trimmed, number: null, suffix: "" };
  const prefix = (match[1] ?? "").trim();
  const number = match[2] ? Number.parseInt(match[2], 10) : null;
  const suffix = (match[3] ?? "").trim();
  return { prefix, number: Number.isFinite(number as number) ? number : null, suffix };
}

function compareTableNumberAsc(a: string, b: string): number {
  const left = splitTableNumber(a);
  const right = splitTableNumber(b);

  if (left.number != null && right.number != null && left.number !== right.number) {
    return left.number - right.number;
  }
  if (left.number != null && right.number == null) return -1;
  if (left.number == null && right.number != null) return 1;

  const prefixDiff = left.prefix.localeCompare(right.prefix);
  if (prefixDiff !== 0) return prefixDiff;

  const suffixDiff = left.suffix.localeCompare(right.suffix);
  if (suffixDiff !== 0) return suffixDiff;

  return a.localeCompare(b);
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
  isSelected,
}: {
  table: TableData;
  onClick: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  positionOverride?: { x: number; y: number };
  isLayoutEditMode: boolean;
  isDragging: boolean;
  isSelected: boolean;
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
        ${isDragging || isSelected ? "ring-2 ring-primary ring-offset-2 z-10" : ""}
        ${baseClass}
      `}
      style={{ left: positionOverride?.x ?? table.posX, top: positionOverride?.y ?? table.posY }}
    >
      {isLayoutEditMode && isSelected ? (
        <span className="absolute top-2 left-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      {!isMaintenance && (table.occupancyStatus === "occupied" || table.occupancyStatus === "payment_pending" || table.occupancyStatus === "paid") && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${occupancyConfig.dot}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${occupancyConfig.dot}`} />
        </span>
      )}

      {isMaintenance ? (
        <Lock className={`absolute top-2 h-3.5 w-3.5 ${isLayoutEditMode && isSelected ? "left-7" : "left-2"}`} />
      ) : null}

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
  const createTable = useCreateTable();

  const [statusFilter, setStatusFilter] = useState<keyof typeof OCCUPANCY_CONFIG | null>(null);
  const [floorZoom, setFloorZoom] = useState(DEFAULT_FLOOR_ZOOM);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [savingLayoutTableId, setSavingLayoutTableId] = useState<number | null>(null);
  const [isAligningLayout, setIsAligningLayout] = useState(false);
  const [selectedLayoutTableIds, setSelectedLayoutTableIds] = useState<number[]>([]);
  const [suppressLayoutClickTableId, setSuppressLayoutClickTableId] = useState<number | null>(null);

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

  const allTables = useMemo(() => (tables ?? []) as TableData[], [tables]);

  const visibleTables = useMemo(
    () => allTables.filter((table) => table.status !== "Archived"),
    [allTables],
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

  useEffect(() => {
    const validIds = new Set(visibleTables.map((table) => table.id));
    setSelectedLayoutTableIds((prev) => prev.filter((id) => validIds.has(id)));
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

  const selectedLayoutCount = useMemo(
    () => roomTables.filter((table) => selectedLayoutTableIds.includes(table.id)).length,
    [roomTables, selectedLayoutTableIds],
  );

  const selectedLayoutTables = useMemo(
    () => roomTables.filter((table) => selectedLayoutTableIds.includes(table.id)),
    [roomTables, selectedLayoutTableIds],
  );
  const selectedRoomTableIds = useMemo(
    () => roomTables.map((table) => table.id),
    [roomTables],
  );
  const allTablesSelectedInRoom = useMemo(() => {
    if (selectedRoomTableIds.length === 0) return false;
    const selectedSet = new Set(selectedLayoutTableIds);
    return selectedRoomTableIds.every((id) => selectedSet.has(id));
  }, [selectedLayoutTableIds, selectedRoomTableIds]);

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

  const getWorkingPosition = useCallback(
    (table: TableData) => draftPositions[table.id] ?? { x: table.posX, y: table.posY },
    [draftPositions],
  );

  const persistTablePositions = useCallback(
    async ({
      updates,
      successTitle,
      errorTitle,
      clearSelection = true,
    }: {
      updates: Array<{ table: TableData; x: number; y: number }>;
      successTitle?: string;
      errorTitle: string;
      clearSelection?: boolean;
    }) => {
      if (updates.length === 0) return;

      const touchedIds = updates.map((entry) => entry.table.id);
      try {
        setIsAligningLayout(true);
        setSavingLayoutTableId(updates[0]?.table.id ?? null);
        await Promise.all(
          updates.map(async ({ table, x, y }) => {
            await updateTable.mutateAsync({
              id: table.id,
              data: { posX: Math.round(x), posY: Math.round(y) },
            });
          }),
        );
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        if (successTitle) toast({ title: successTitle });
      } catch (error) {
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({
          title: errorTitle,
          description: error instanceof Error ? error.message : t("common.unknownError"),
          variant: "destructive",
        });
      } finally {
        setIsAligningLayout(false);
        setSavingLayoutTableId(null);
        setDraftPositions((prev) => {
          const next = { ...prev };
          for (const id of touchedIds) {
            delete next[id];
          }
          return next;
        });
        if (clearSelection) {
          setSelectedLayoutTableIds([]);
        }
      }
    },
    [queryClient, t, toast, updateTable],
  );

  const duplicateTablesWithPositions = useCallback(
    async (tablesToCopy: TableData[], targetPositions: Record<number, { x: number; y: number }>) => {
      if (tablesToCopy.length === 0) return;

      const existingNumbers = new Set(allTables.map((table) => table.tableNumber));
      try {
        setSavingLayoutTableId(tablesToCopy[0]?.id ?? null);
        for (const table of tablesToCopy) {
          const nextTableNumber = getNextTableNumber(table.tableNumber, existingNumbers);
          existingNumbers.add(nextTableNumber);
          const target = targetPositions[table.id] ?? clampPosition(table.posX + 28, table.posY + 28);

          await createTable.mutateAsync({
            data: {
              tableNumber: nextTableNumber,
              zone: table.zone,
              capacity: table.capacity,
              category: table.category,
              status: table.status === "Archived" ? "Active" : table.status,
              isBooked: false,
              occupancyStatus: "available",
              posX: Math.round(target.x),
              posY: Math.round(target.y),
            },
          });
        }

        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        setSelectedLayoutTableIds([]);
        toast({
          title: t("floorPlan.copySelectedSuccess", { count: tablesToCopy.length }),
        });
      } catch (error) {
        toast({
          title: t("floorPlan.copySelectedFailedTitle"),
          description: error instanceof Error ? error.message : t("common.unknownError"),
          variant: "destructive",
        });
      } finally {
        setSavingLayoutTableId(null);
      }
    },
    [allTables, clampPosition, createTable, queryClient, t, toast],
  );

  const handleAlignSelectedTables = useCallback(
    async (action: AlignAction) => {
      if (selectedLayoutTables.length < 2 || savingLayoutTableId !== null || isAligningLayout) return;
      if ((action === "distribute_horizontal" || action === "distribute_vertical") && selectedLayoutTables.length < 3) {
        return;
      }

      const currentPositions = selectedLayoutTables.map((table) => ({
        id: table.id,
        table,
        ...getWorkingPosition(table),
      }));

      const minX = Math.min(...currentPositions.map((item) => item.x));
      const maxX = Math.max(...currentPositions.map((item) => item.x));
      const minY = Math.min(...currentPositions.map((item) => item.y));
      const maxY = Math.max(...currentPositions.map((item) => item.y));
      const centerX = Math.round((minX + maxX) / 2);
      const middleY = Math.round((minY + maxY) / 2);

      const alignedById = new Map<number, { x: number; y: number }>();

      if (action === "distribute_horizontal") {
        const sorted = [...currentPositions].sort((a, b) => a.x - b.x);
        const span = maxX - minX;
        const gap = span / (sorted.length - 1);
        sorted.forEach((pos, index) => {
          alignedById.set(pos.id, clampPosition(Math.round(minX + gap * index), pos.y));
        });
      } else if (action === "distribute_vertical") {
        const sorted = [...currentPositions].sort((a, b) => a.y - b.y);
        const span = maxY - minY;
        const gap = span / (sorted.length - 1);
        sorted.forEach((pos, index) => {
          alignedById.set(pos.id, clampPosition(pos.x, Math.round(minY + gap * index)));
        });
      } else {
        for (const pos of currentPositions) {
          let nextX = pos.x;
          let nextY = pos.y;

          if (action === "top") nextY = minY;
          if (action === "bottom") nextY = maxY;
          if (action === "left") nextX = minX;
          if (action === "right") nextX = maxX;
          if (action === "center") nextX = centerX;
          if (action === "middle") nextY = middleY;

          alignedById.set(pos.id, clampPosition(nextX, nextY));
        }
      }

      setDraftPositions((prev) => {
        const next = { ...prev };
        for (const [id, pos] of alignedById.entries()) {
          next[id] = pos;
        }
        return next;
      });

      const updates = currentPositions
        .map(({ table, id }) => {
          const pos = alignedById.get(id);
          if (!pos) return null;
          return { table, x: pos.x, y: pos.y };
        })
        .filter((entry): entry is { table: TableData; x: number; y: number } => entry !== null);

      await persistTablePositions({
        updates,
        successTitle: t("floorPlan.align.success", {
          count: selectedLayoutTables.length,
          action: t(ALIGN_LABEL_KEY[action]),
        }),
        errorTitle: t("floorPlan.align.failedTitle"),
      });
    },
    [
      clampPosition,
      getWorkingPosition,
      isAligningLayout,
      persistTablePositions,
      savingLayoutTableId,
      selectedLayoutTables,
      t,
    ],
  );

  const handleAutoArrangeSelectedTables = useCallback(async () => {
    if (selectedLayoutTables.length < 2 || savingLayoutTableId !== null || isAligningLayout) return;

    const ordered = [...selectedLayoutTables]
      .sort((a, b) => compareTableNumberAsc(a.tableNumber, b.tableNumber))
      .map((table) => ({
        table,
        ...getWorkingPosition(table),
      }));

    const minX = Math.min(...ordered.map((item) => item.x));
    const minY = Math.min(...ordered.map((item) => item.y));

    const count = ordered.length;
    const availableWidth = FLOOR_CANVAS_WIDTH - TABLE_CARD_WIDTH;
    const availableHeight = FLOOR_CANVAS_HEIGHT - TABLE_CARD_HEIGHT;
    const maxRowsNoOverlap = Math.max(1, Math.floor(availableHeight / TABLE_CARD_HEIGHT) + 1);
    const maxColsNoOverlap = Math.max(1, Math.floor(availableWidth / TABLE_CARD_WIDTH) + 1);

    const rows = Math.min(maxRowsNoOverlap, count);
    const columns = Math.min(maxColsNoOverlap, Math.max(1, Math.ceil(count / rows)));
    const resolvedRows = Math.max(1, Math.ceil(count / columns));

    const stepX = columns > 1 ? availableWidth / (columns - 1) : 0;
    const stepY = resolvedRows > 1 ? availableHeight / (resolvedRows - 1) : 0;

    const layoutWidth = columns > 1 ? stepX * (columns - 1) : 0;
    const layoutHeight = resolvedRows > 1 ? stepY * (resolvedRows - 1) : 0;
    const startX = Math.max(0, Math.min(minX, availableWidth - layoutWidth));
    const startY = Math.max(0, Math.min(minY, availableHeight - layoutHeight));

    const arrangedById = new Map<number, { x: number; y: number }>();
    ordered.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      arrangedById.set(
        item.table.id,
        clampPosition(Math.round(startX + col * stepX), Math.round(startY + row * stepY)),
      );
    });

    setDraftPositions((prev) => {
      const next = { ...prev };
      for (const [id, pos] of arrangedById.entries()) {
        next[id] = pos;
      }
      return next;
    });

    const updates = ordered
      .map(({ table }) => {
        const pos = arrangedById.get(table.id);
        if (!pos) return null;
        return { table, x: pos.x, y: pos.y };
      })
      .filter((entry): entry is { table: TableData; x: number; y: number } => entry !== null);

    await persistTablePositions({
      updates,
      successTitle: t("floorPlan.autoArrangeSuccess", { count: selectedLayoutTables.length }),
      errorTitle: t("floorPlan.autoArrangeFailedTitle"),
    });
  }, [
    clampPosition,
    getWorkingPosition,
    isAligningLayout,
    persistTablePositions,
    savingLayoutTableId,
    selectedLayoutTables,
    t,
  ]);

  const handleZoomIn = useCallback(() => {
    setFloorZoom((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFloorZoom((prev) => Math.max(0.45, Number((prev - 0.1).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setFloorZoom(DEFAULT_FLOOR_ZOOM);
  }, []);

  const handleTablePointerDown = useCallback(
    (table: TableData, event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isLayoutEditMode || savingLayoutTableId !== null || isAligningLayout) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      setSelectedTableId(null);
      const cloneMode = event.ctrlKey || event.metaKey;
      const roomTableIds = new Set(roomTables.map((item) => item.id));
      const selectedIdsInRoom = selectedLayoutTableIds.filter((id) => roomTableIds.has(id));
      const shouldUseSelection = selectedIdsInRoom.includes(table.id);
      const tableIds = shouldUseSelection ? selectedIdsInRoom : [table.id];
      const startPositions: Record<number, { x: number; y: number }> = {};
      for (const id of tableIds) {
        const target = visibleTables.find((item) => item.id === id);
        if (!target) continue;
        startPositions[id] = getWorkingPosition(target);
      }

      setDragState({
        tableIds,
        anchorTableId: table.id,
        cloneMode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPositions,
      });
    },
    [
      getWorkingPosition,
      isAligningLayout,
      isLayoutEditMode,
      savingLayoutTableId,
      selectedLayoutTableIds,
      roomTables,
      visibleTables,
    ],
  );

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (event: PointerEvent) => {
      const dx = (event.clientX - dragState.startClientX) / floorZoom;
      const dy = (event.clientY - dragState.startClientY) / floorZoom;
      setDraftPositions((prev) => {
        const next = { ...prev };
        for (const tableId of dragState.tableIds) {
          const startPos = dragState.startPositions[tableId];
          if (!startPos) continue;
          next[tableId] = clampPosition(startPos.x + dx, startPos.y + dy);
        }
        return next;
      });
    };

    const onPointerUp = () => {
      const updates = dragState.tableIds
        .map((tableId) => {
          const table = visibleTables.find((item) => item.id === tableId);
          const startPos = dragState.startPositions[tableId];
          if (!table || !startPos) return null;
          const current = draftPositions[tableId] ?? startPos;
          return { table, startPos, current };
        })
        .filter((entry): entry is { table: TableData; startPos: { x: number; y: number }; current: { x: number; y: number } } => entry !== null);

      const moved = updates.some(
        ({ startPos, current }) => Math.abs(current.x - startPos.x) > 0.5 || Math.abs(current.y - startPos.y) > 0.5,
      );
      const anchorTableId = dragState.anchorTableId;
      const cloneMode = dragState.cloneMode;
      setDragState(null);

      if (!moved) {
        setDraftPositions((prev) => {
          const next = { ...prev };
          for (const tableId of dragState.tableIds) {
            delete next[tableId];
          }
          return next;
        });
        return;
      }

      setSuppressLayoutClickTableId(anchorTableId);

      if (cloneMode) {
        const targetPositions: Record<number, { x: number; y: number }> = {};
        for (const update of updates) {
          targetPositions[update.table.id] = update.current;
        }
        setDraftPositions((prev) => {
          const next = { ...prev };
          for (const update of updates) {
            delete next[update.table.id];
          }
          return next;
        });
        void duplicateTablesWithPositions(
          updates.map((entry) => entry.table),
          targetPositions,
        );
        return;
      }

      void persistTablePositions({
        updates: updates.map(({ table, current }) => ({ table, x: current.x, y: current.y })),
        successTitle:
          updates.length === 1
            ? t("floorPlan.layoutSavedToast", { tableNumber: updates[0].table.tableNumber })
            : t("floorPlan.layoutSavedMultipleToast", { count: updates.length }),
        errorTitle: t("floorPlan.layoutSaveFailedTitle"),
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [clampPosition, dragState, draftPositions, duplicateTablesWithPositions, floorZoom, persistTablePositions, t, visibleTables]);

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
      if (isAligningLayout) return;
      if (suppressLayoutClickTableId === table.id) {
        setSuppressLayoutClickTableId(null);
        return;
      }
      setSelectedLayoutTableIds((prev) =>
        prev.includes(table.id) ? prev.filter((id) => id !== table.id) : [...prev, table.id],
      );
      return;
    }
    if (table.status !== "Active") {
      return;
    }
    if (roomActiveByCode.get(table.zone) === false) {
      return;
    }
    setSelectedTableId(table.id);
  }, [isAligningLayout, isLayoutEditMode, roomActiveByCode, suppressLayoutClickTableId]);

  const handleCopySelectedTables = useCallback(async () => {
    if (!selectedRoomCode) return;

    const selectedTables = roomTables.filter((table) => selectedLayoutTableIds.includes(table.id));
    if (selectedTables.length === 0) return;
    const nextPositions: Record<number, { x: number; y: number }> = {};
    for (const table of selectedTables) {
      nextPositions[table.id] = clampPosition(table.posX + 28, table.posY + 28);
    }
    await duplicateTablesWithPositions(selectedTables, nextPositions);
  }, [clampPosition, duplicateTablesWithPositions, roomTables, selectedLayoutTableIds, selectedRoomCode]);

  const handleSelectAllTablesInRoom = useCallback(() => {
    if (!isLayoutEditMode || selectedRoomTableIds.length === 0) return;
    setSelectedLayoutTableIds((prev) => {
      const next = new Set(prev);
      for (const id of selectedRoomTableIds) next.add(id);
      return [...next];
    });
  }, [isLayoutEditMode, selectedRoomTableIds]);

  const handleClearSelectedTablesInRoom = useCallback(() => {
    if (!isLayoutEditMode || selectedRoomTableIds.length === 0) return;
    const roomSet = new Set(selectedRoomTableIds);
    setSelectedLayoutTableIds((prev) => prev.filter((id) => !roomSet.has(id)));
  }, [isLayoutEditMode, selectedRoomTableIds]);

  const getLatestTableOrder = useCallback(async (tableId: number, status: string): Promise<SimpleOrder | null> => {
    try {
      const orders = await customFetch<SimpleOrder[]>(
        `/api/orders?tableId=${tableId}&status=${encodeURIComponent(status)}`,
        { method: "GET", responseType: "json" },
      );
      return orders[0] ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleStartOrder = useCallback(async (table: TableData) => {
    if (table.occupancyStatus === "payment_pending") {
      let targetOrderId = table.currentOrderId;

      if (!targetOrderId) {
        const readyToPayOrder = await getLatestTableOrder(table.id, "ready_to_pay");
        if (readyToPayOrder) {
          targetOrderId = readyToPayOrder.id;
          try {
            await updateTable.mutateAsync({
              id: table.id,
              data: { occupancyStatus: "payment_pending", currentOrderId: readyToPayOrder.id },
            });
            await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
          } catch {}
        }
      }

      if (targetOrderId) {
        setLocation(`/cashier?orderId=${targetOrderId}`);
        setSelectedTableId(null);
        return;
      }

      const openOrder = await getLatestTableOrder(table.id, "open");
      if (openOrder) {
        try {
          await updateTable.mutateAsync({
            id: table.id,
            data: { occupancyStatus: "occupied", currentOrderId: openOrder.id },
          });
          await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        } catch {}
        toast({
          title: t("floorPlan.fixedStaleStatusTitle"),
          description: t("floorPlan.fixedStaleStatusDesc"),
        });
        setLocation(`/orders/${openOrder.id}`);
        setSelectedTableId(null);
        return;
      }

      try {
        await updateTable.mutateAsync({
          id: table.id,
          data: { occupancyStatus: "available", currentOrderId: null },
        });
        await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      } catch {}
      toast({
        title: t("floorPlan.missingPaymentOrderTitle"),
        description: t("floorPlan.missingPaymentOrderDesc"),
        variant: "destructive",
      });
      setSelectedTableId(null);
      return;
    }

    if (table.currentOrderId && (table.occupancyStatus === "occupied" || table.occupancyStatus === "paid")) {
      setLocation(`/orders/${table.currentOrderId}`);
      setSelectedTableId(null);
      return;
    }

    if (!table.currentOrderId && (table.occupancyStatus === "occupied" || table.occupancyStatus === "paid")) {
      const openOrder = await getLatestTableOrder(table.id, "open");
      if (openOrder) {
        setLocation(`/orders/${openOrder.id}`);
        setSelectedTableId(null);
        return;
      }

      const readyToPayOrder = await getLatestTableOrder(table.id, "ready_to_pay");
      if (readyToPayOrder) {
        setLocation(`/cashier?orderId=${readyToPayOrder.id}`);
        setSelectedTableId(null);
        return;
      }
    }

    setLocation(`/orders?tableId=${table.id}`);
    setSelectedTableId(null);
  }, [getLatestTableOrder, queryClient, setLocation, t, toast, updateTable]);

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
              setSelectedLayoutTableIds([]);
              setSuppressLayoutClickTableId(null);
              setIsLayoutEditMode((prev) => !prev);
            }}
            disabled={savingLayoutTableId !== null || createTable.isPending || isAligningLayout}
          >
            {isLayoutEditMode ? t("floorPlan.exitLayoutEdit") : t("floorPlan.editLayout")}
          </Button>

          {isLayoutEditMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleCopySelectedTables(); }}
              disabled={selectedLayoutCount === 0 || createTable.isPending || isAligningLayout}
              className="gap-2"
            >
              {createTable.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              {t("floorPlan.copySelected", { count: selectedLayoutCount })}
            </Button>
          ) : null}

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
        <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {savingLayoutTableId !== null || isAligningLayout
              ? t("floorPlan.layoutSaving")
              : t("floorPlan.layoutEditHint", { count: selectedLayoutCount })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant={allTablesSelectedInRoom ? "secondary" : "outline"}
              size="sm"
              onClick={handleSelectAllTablesInRoom}
              disabled={selectedRoomTableIds.length === 0 || savingLayoutTableId !== null || isAligningLayout}
            >
              {t("floorPlan.selectAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSelectedTablesInRoom}
              disabled={selectedLayoutCount === 0 || savingLayoutTableId !== null || isAligningLayout}
            >
              {t("floorPlan.clearSelection")}
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-9">
            {(
              [
                "top",
                "bottom",
                "left",
                "right",
                "center",
                "middle",
                "distribute_horizontal",
                "distribute_vertical",
              ] as AlignAction[]
            ).map((action) => (
              <Button
                key={action}
                variant="outline"
                size="sm"
                className="h-auto w-full whitespace-normal px-2 py-1.5 text-xs leading-tight"
                onClick={() => {
                  void handleAlignSelectedTables(action);
                }}
                disabled={
                  selectedLayoutCount < 2 ||
                  (action === "distribute_horizontal" || action === "distribute_vertical"
                    ? selectedLayoutCount < 3
                    : false) ||
                  savingLayoutTableId !== null ||
                  isAligningLayout
                }
                title={t(ALIGN_LABEL_KEY[action])}
              >
                {t(ALIGN_LABEL_KEY[action])}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-auto w-full whitespace-normal px-2 py-1.5 text-xs leading-tight"
              onClick={() => {
                void handleAutoArrangeSelectedTables();
              }}
              disabled={selectedLayoutCount < 2 || savingLayoutTableId !== null || isAligningLayout}
              title={t("floorPlan.autoArrange")}
            >
              {t("floorPlan.autoArrange")}
            </Button>
          </div>
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
                  isDragging={dragState?.tableIds.includes(table.id) ?? false}
                  isSelected={selectedLayoutTableIds.includes(table.id)}
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
