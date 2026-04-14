import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, UtensilsCrossed } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

type CustomerProfile = {
  fullName: string;
  phones: string[];
};

type CustomerBookingConfig = {
  bookingLeadTimeMinutes: number;
  bookingNoShowGraceMinutes: number;
  bookingDefaultSlotMinutes: number;
};

type CustomerLayoutRoom = {
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type CustomerLayoutTable = {
  id: number;
  tableNumber: string;
  zone: string;
  capacity: number;
  category: string;
  posX: number;
  posY: number;
  status: "Active" | "Maintenance" | "Archived";
  occupancyStatus: "available" | "occupied" | "payment_pending" | "paid" | "dirty";
  isBooked: boolean;
  roomName: string;
  roomSortOrder: number;
  roomIsActive: boolean;
  isSelectable: boolean;
};

type CustomerLayoutResponse = {
  rooms: CustomerLayoutRoom[];
  tables: CustomerLayoutTable[];
};

type BookingRecord = {
  id: number;
  tableId: number;
  customerName: string;
  customerPhone: string;
  slotStartAt: string;
  slotEndAt: string;
  status: "pending_payment" | "confirmed" | "checked_in" | "cancelled" | "completed";
};

const CONFIG_QUERY_KEY = ["bookings", "customer-config"];
const LAYOUT_QUERY_KEY = ["bookings", "customer-layout"];
const HISTORY_QUERY_KEY = ["bookings", "customer-history"];
const PROFILE_QUERY_KEY = ["customers", "me", "mini"];

function toDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
}

function getStatusClass(status: BookingRecord["status"]): string {
  if (status === "confirmed") return "bg-blue-100 text-blue-700 border-blue-300";
  if (status === "checked_in") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "pending_payment") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "cancelled") return "bg-red-100 text-red-700 border-red-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function getFallbackRoomName(code: string, t: (key: string) => string): string {
  const normalized = code.trim().toLowerCase();
  if (normalized === "aircon") return t("zones.aircon");
  if (normalized === "outside" || normalized === "outdoor") return t("zones.outside");
  if (normalized === "hall") return t("zones.hall");
  return code;
}

function getTableStatusLabel(table: CustomerLayoutTable, t: (key: string) => string): string {
  if (table.status !== "Active") return t(`status.service.${table.status}`);
  if (table.isBooked) return t("floorPlan.reserved");
  return t(`status.occupancy.${table.occupancyStatus}`);
}

function getTableCardClass(table: CustomerLayoutTable, selected: boolean): string {
  if (table.isSelectable) {
    return selected
      ? "border-emerald-700 bg-emerald-600 text-white"
      : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  }
  if (table.status === "Maintenance" || table.status === "Archived") {
    return "border-slate-300 bg-slate-100 text-slate-500";
  }
  if (table.isBooked) {
    return "border-blue-300 bg-blue-100 text-blue-700";
  }
  if (table.occupancyStatus === "occupied") {
    return "border-amber-300 bg-amber-100 text-amber-800";
  }
  if (table.occupancyStatus === "payment_pending") {
    return "border-red-300 bg-red-100 text-red-700";
  }
  if (table.occupancyStatus === "paid") {
    return "border-indigo-300 bg-indigo-100 text-indigo-700";
  }
  if (table.occupancyStatus === "dirty") {
    return "border-slate-300 bg-slate-200 text-slate-700";
  }
  return "border-slate-300 bg-slate-100 text-slate-600";
}

export default function CustomerBookingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";

  const { data: profile } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => customFetch<CustomerProfile>("/api/customers/me", { method: "GET", responseType: "json" }),
    enabled: isCustomer,
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => customFetch<CustomerBookingConfig>("/api/bookings/customer-config", { method: "GET", responseType: "json" }),
    enabled: isCustomer,
  });

  const { data: layoutData, isLoading: layoutLoading } = useQuery({
    queryKey: LAYOUT_QUERY_KEY,
    queryFn: () => customFetch<CustomerLayoutResponse>("/api/bookings/customer-layout", { method: "GET", responseType: "json" }),
    enabled: isCustomer,
    refetchInterval: 15000,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: () => customFetch<BookingRecord[]>("/api/bookings?limit=60", { method: "GET", responseType: "json" }),
    enabled: isCustomer,
    refetchInterval: 15000,
  });

  const allTables = layoutData?.tables ?? [];

  const rooms = useMemo<CustomerLayoutRoom[]>(() => {
    const defaults: CustomerLayoutRoom[] = [
      { code: "hall", name: t("zones.hall"), sortOrder: 1, isActive: true },
      { code: "aircon", name: t("zones.aircon"), sortOrder: 2, isActive: true },
      { code: "outside", name: t("zones.outside"), sortOrder: 3, isActive: true },
    ];
    const byCode = new Map(defaults.map((room) => [room.code, room]));

    for (const room of layoutData?.rooms ?? []) {
      byCode.set(room.code, {
        code: room.code,
        name: room.name || getFallbackRoomName(room.code, t),
        sortOrder: room.sortOrder,
        isActive: room.isActive,
      });
    }

    for (const table of allTables) {
      if (byCode.has(table.zone)) continue;
      byCode.set(table.zone, {
        code: table.zone,
        name: table.roomName || getFallbackRoomName(table.zone, t),
        sortOrder: table.roomSortOrder,
        isActive: table.roomIsActive,
      });
    }

    return [...byCode.values()].sort((left, right) => {
      const orderDiff = left.sortOrder - right.sortOrder;
      if (orderDiff !== 0) return orderDiff;
      return left.name.localeCompare(right.name);
    });
  }, [allTables, layoutData?.rooms, t]);

  const [selectedRoomCode, setSelectedRoomCode] = useState<string>("hall");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [slotStartAt, setSlotStartAt] = useState<string>(toDateTimeInputValue(new Date(Date.now() + (65 * 60_000))));
  const [slotMinutes, setSlotMinutes] = useState<string>("120");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!config) return;
    setSlotMinutes(String(config.bookingDefaultSlotMinutes));
    setSlotStartAt(toDateTimeInputValue(new Date(Date.now() + ((config.bookingLeadTimeMinutes + 5) * 60_000))));
  }, [config]);

  useEffect(() => {
    if (!rooms.length) return;
    if (rooms.some((room) => room.code === selectedRoomCode)) return;
    setSelectedRoomCode(rooms[0].code);
  }, [rooms, selectedRoomCode]);

  const tablesByRoom = useMemo(() => {
    const grouped = new Map<string, CustomerLayoutTable[]>();
    for (const table of allTables) {
      const existing = grouped.get(table.zone) ?? [];
      existing.push(table);
      grouped.set(table.zone, existing);
    }
    for (const roomTables of grouped.values()) {
      roomTables.sort((left, right) => left.tableNumber.localeCompare(right.tableNumber, undefined, { numeric: true }));
    }
    return grouped;
  }, [allTables]);

  const roomTables = tablesByRoom.get(selectedRoomCode) ?? [];
  const selectableRoomTables = roomTables.filter((table) => table.isSelectable);
  const selectedRoom = rooms.find((room) => room.code === selectedRoomCode);

  useEffect(() => {
    if (!selectableRoomTables.length) {
      setSelectedTableId(null);
      return;
    }
    if (selectedTableId && selectableRoomTables.some((table) => table.id === selectedTableId)) return;
    setSelectedTableId(selectableRoomTables[0].id);
  }, [selectableRoomTables, selectedTableId]);

  const layoutMetrics = useMemo(() => {
    if (roomTables.length === 0) {
      return { minX: 0, minY: 0, rangeX: 1, rangeY: 1 };
    }
    const xs = roomTables.map((table) => table.posX);
    const ys = roomTables.map((table) => table.posY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      rangeX: Math.max(maxX - minX, 1),
      rangeY: Math.max(maxY - minY, 1),
    };
  }, [roomTables]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTableId) throw new Error("Please select a table.");
      if (!slotStartAt) throw new Error("Please select booking date and time.");
      const selectedTable = roomTables.find((table) => table.id === selectedTableId);
      if (!selectedTable?.isSelectable) {
        throw new Error("Only available tables can be selected.");
      }

      const slotMinutesNumber = Number.parseInt(slotMinutes, 10);
      if (!Number.isFinite(slotMinutesNumber) || slotMinutesNumber < 15) {
        throw new Error("slotMinutes must be at least 15.");
      }

      return customFetch<BookingRecord>("/api/bookings", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          tableId: selectedTableId,
          slotStartAt: new Date(slotStartAt).toISOString(),
          slotMinutes: slotMinutesNumber,
          bookingFee: "0",
          preorderAmount: "0",
          bookingFeePaid: true,
          preorderAmountPaid: true,
          notes: notes.trim() || undefined,
        }),
      });
    },
    onSuccess: async (createdBooking) => {
      toast({ title: t("bookings.toastCreated") });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: LAYOUT_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY }),
      ]);
      setLocation(`/orders?tableId=${createdBooking.tableId}&scan=1`);
    },
    onError: (error) => {
      toast({
        title: t("bookings.toastCreateFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    },
  });

  if (!isCustomer) {
    return (
      <div className="space-y-4">
        <Button variant="outline" className="gap-2" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" />
          {t("auth.cancelToHome")}
        </Button>
      </div>
    );
  }

  if (configLoading || layoutLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("bookings.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("bookings.customerSubtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" />
          {t("bookings.backToMenu")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("bookings.chooseTableLayout")}</CardTitle>
        </CardHeader>
        <CardContent>
          {allTables.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bookings.noAvailableTable")}</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">{t("bookings.zoneFilter")}</p>
                <div className="flex flex-wrap gap-2">
                  {rooms.map((room) => {
                    const active = selectedRoomCode === room.code;
                    const count = tablesByRoom.get(room.code)?.length ?? 0;
                    return (
                      <button
                        key={room.code}
                        type="button"
                        onClick={() => setSelectedRoomCode(room.code)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {room.name} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {roomTables.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("bookings.noAvailableTableInZone", { zone: selectedRoom?.name ?? getFallbackRoomName(selectedRoomCode, t) })}
                </p>
              ) : null}

              <div className="relative h-[420px] overflow-hidden rounded-lg border bg-muted/20">
                {roomTables.map((table) => {
                  const left = 6 + (((table.posX - layoutMetrics.minX) / layoutMetrics.rangeX) * 88);
                  const top = 8 + (((table.posY - layoutMetrics.minY) / layoutMetrics.rangeY) * 80);
                  const selected = selectedTableId === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={!table.isSelectable}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1.5 text-center text-[11px] font-semibold shadow-sm transition-colors ${
                        getTableCardClass(table, selected)
                      } ${table.isSelectable ? "" : "cursor-not-allowed opacity-90"}`}
                      style={{ left: `${left}%`, top: `${top}%`, width: "86px", minHeight: "58px" }}
                      onClick={() => {
                        if (!table.isSelectable) return;
                        setSelectedTableId(table.id);
                      }}
                    >
                      <p className="font-bold">{table.tableNumber}</p>
                      <p className="mt-0.5 text-[10px] leading-tight opacity-90">{getTableStatusLabel(table, t)}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("bookings.table")}</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedTableId ?? ""}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setSelectedTableId(Number.isFinite(parsed) ? parsed : null);
                    }}
                  >
                    {selectableRoomTables.length === 0 ? (
                      <option value="">{t("bookings.selectTable")}</option>
                    ) : null}
                    {selectableRoomTables.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.tableNumber} ({selectedRoom?.name ?? getFallbackRoomName(table.zone, t)})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{t("bookings.availableOnlyHint")}</p>
                </div>
                <div className="space-y-1">
                  <Label>{t("bookings.customer")}</Label>
                  <Input
                    disabled
                    value={`${profile?.fullName ?? user?.name ?? "-"} ${profile?.phones?.[0] ? `(${profile.phones[0]})` : ""}`.trim()}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("bookings.slotStart")}</Label>
                  <Input
                    type="datetime-local"
                    value={slotStartAt}
                    onChange={(event) => setSlotStartAt(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("bookings.leadTimeHint", { minutes: config?.bookingLeadTimeMinutes ?? 60 })}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>{t("bookings.slotMinutes")}</Label>
                  <Input value={slotMinutes} onChange={(event) => setSlotMinutes(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t("bookings.notes")}</Label>
                  <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </div>

              <Button className="gap-2" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !selectedTableId}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />}
                {t("bookings.bookAndOrder")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("bookings.history")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bookings.empty")}</p>
          ) : (
            history.map((booking) => (
              <div key={booking.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">#{booking.id} · {booking.customerName}</p>
                  <Badge variant="outline" className={getStatusClass(booking.status)}>
                    {t(`bookings.statusValues.${booking.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(booking.slotStartAt).toLocaleString()} {t("bookings.to")} {new Date(booking.slotEndAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
