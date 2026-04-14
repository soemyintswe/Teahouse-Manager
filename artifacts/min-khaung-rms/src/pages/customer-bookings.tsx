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

type CustomerLayoutTable = {
  id: number;
  tableNumber: string;
  zone: string;
  capacity: number;
  category: string;
  posX: number;
  posY: number;
  status: string;
  occupancyStatus: string;
  isBooked: boolean;
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

  const { data: availableTables = [], isLoading: layoutLoading } = useQuery({
    queryKey: LAYOUT_QUERY_KEY,
    queryFn: () => customFetch<CustomerLayoutTable[]>("/api/bookings/customer-layout", { method: "GET", responseType: "json" }),
    enabled: isCustomer,
    refetchInterval: 15000,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: () => customFetch<BookingRecord[]>("/api/bookings?limit=60", { method: "GET", responseType: "json" }),
    enabled: isCustomer,
    refetchInterval: 15000,
  });

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
    if (!availableTables.length) return;
    if (selectedTableId && availableTables.some((table) => table.id === selectedTableId)) return;
    setSelectedTableId(availableTables[0].id);
  }, [availableTables, selectedTableId]);

  const layoutMetrics = useMemo(() => {
    if (availableTables.length === 0) {
      return { minX: 0, minY: 0, rangeX: 1, rangeY: 1 };
    }
    const xs = availableTables.map((table) => table.posX);
    const ys = availableTables.map((table) => table.posY);
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
  }, [availableTables]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTableId) throw new Error("Please select a table.");
      if (!slotStartAt) throw new Error("Please select booking date and time.");
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
          {availableTables.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bookings.noAvailableTable")}</p>
          ) : (
            <div className="space-y-3">
              <div className="relative h-[360px] overflow-hidden rounded-lg border bg-muted/20">
                {availableTables.map((table) => {
                  const left = 6 + (((table.posX - layoutMetrics.minX) / layoutMetrics.rangeX) * 88);
                  const top = 8 + (((table.posY - layoutMetrics.minY) / layoutMetrics.rangeY) * 80);
                  const selected = selectedTableId === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-3 py-2 text-xs font-semibold shadow-sm ${
                        selected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                      }`}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      onClick={() => setSelectedTableId(table.id)}
                    >
                      {table.tableNumber}
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
                    onChange={(event) => setSelectedTableId(Number.parseInt(event.target.value, 10))}
                  >
                    {availableTables.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.tableNumber} ({table.zone})
                      </option>
                    ))}
                  </select>
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

