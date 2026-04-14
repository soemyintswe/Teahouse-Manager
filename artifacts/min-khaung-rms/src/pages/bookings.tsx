import { useEffect, useMemo, useState } from "react";
import { customFetch, getListTablesQueryKey, useListTables } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type BookingRecord = {
  id: number;
  tableId: number;
  customerName: string;
  customerPhone: string;
  slotStartAt: string;
  slotEndAt: string;
  extensionMinutes: number;
  bookingFee: string;
  preorderAmount: string;
  bookingFeePaid: boolean;
  preorderAmountPaid: boolean;
  status: "pending_payment" | "confirmed" | "checked_in" | "cancelled" | "completed";
  autoCancelAt: string;
  confirmedAt: string | null;
  checkInAt: string | null;
  orderAt: string | null;
  checkOutAt: string | null;
  orderId: number | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type BusinessHoursResponse = {
  bookingLeadTimeMinutes: number;
  bookingNoShowGraceMinutes: number;
  bookingDefaultSlotMinutes: number;
};

type BookingForm = {
  tableId: string;
  customerName: string;
  customerPhone: string;
  slotStartAt: string;
  slotMinutes: string;
  bookingFee: string;
  preorderAmount: string;
  bookingFeePaid: boolean;
  preorderAmountPaid: boolean;
  notes: string;
};

const BOOKINGS_QUERY_KEY = ["bookings", "list"];
const BUSINESS_RULES_QUERY_KEY = ["settings", "business-hours", "rules"];

function toDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
}

function buildDefaultForm(leadMinutes: number, defaultSlotMinutes: number): BookingForm {
  const now = new Date();
  const leadAdjusted = new Date(now.getTime() + ((leadMinutes + 5) * 60_000));
  return {
    tableId: "",
    customerName: "",
    customerPhone: "",
    slotStartAt: toDateTimeInputValue(leadAdjusted),
    slotMinutes: String(defaultSlotMinutes),
    bookingFee: "0",
    preorderAmount: "0",
    bookingFeePaid: false,
    preorderAmountPaid: false,
    notes: "",
  };
}

function getStatusClass(status: BookingRecord["status"]): string {
  if (status === "confirmed") return "bg-blue-100 text-blue-700 border-blue-300";
  if (status === "checked_in") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "pending_payment") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "cancelled") return "bg-red-100 text-red-700 border-red-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

export default function BookingsPage() {
  const { t } = useTranslation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tableIdFromSearch = useMemo(() => {
    const raw = new URLSearchParams(search).get("tableId");
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [search]);

  const { data: tables = [], isLoading: tablesLoading } = useListTables({
    query: {
      queryKey: getListTablesQueryKey(),
      refetchInterval: 15000,
    },
  });

  const { data: businessRules, isLoading: rulesLoading } = useQuery({
    queryKey: BUSINESS_RULES_QUERY_KEY,
    queryFn: () => customFetch<BusinessHoursResponse>("/api/settings/business-hours", { method: "GET", responseType: "json" }),
  });

  const { data: bookings = [], isLoading: bookingsLoading, refetch: refetchBookings } = useQuery({
    queryKey: BOOKINGS_QUERY_KEY,
    queryFn: () => customFetch<BookingRecord[]>("/api/bookings?limit=300", { method: "GET", responseType: "json" }),
    refetchInterval: 15000,
  });

  const [form, setForm] = useState<BookingForm>(() => buildDefaultForm(60, 120));

  useEffect(() => {
    if (!businessRules) return;
    setForm((prev) => ({
      ...prev,
      slotMinutes: prev.slotMinutes || String(businessRules.bookingDefaultSlotMinutes),
      slotStartAt: prev.slotStartAt || toDateTimeInputValue(new Date(Date.now() + (businessRules.bookingLeadTimeMinutes * 60_000))),
    }));
  }, [businessRules]);

  useEffect(() => {
    if (!tableIdFromSearch) return;
    setForm((prev) => ({ ...prev, tableId: String(tableIdFromSearch) }));
  }, [tableIdFromSearch]);

  const tableNumberById = useMemo(
    () => new Map(tables.map((table) => [table.id, table.tableNumber])),
    [tables],
  );

  const availableTables = useMemo(
    () => tables.filter((table) => table.status === "Active" && table.occupancyStatus === "available" && !table.isBooked),
    [tables],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: BookingForm) =>
      customFetch<BookingRecord>("/api/bookings", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({
          tableId: Number.parseInt(payload.tableId, 10),
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          slotStartAt: new Date(payload.slotStartAt).toISOString(),
          slotMinutes: Number.parseInt(payload.slotMinutes, 10),
          bookingFee: payload.bookingFee,
          preorderAmount: payload.preorderAmount,
          bookingFeePaid: payload.bookingFeePaid,
          preorderAmountPaid: payload.preorderAmountPaid,
          notes: payload.notes.trim() || undefined,
        }),
      }),
    onSuccess: async () => {
      toast({ title: t("bookings.toastCreated") });
      const lead = businessRules?.bookingLeadTimeMinutes ?? 60;
      const slot = businessRules?.bookingDefaultSlotMinutes ?? 120;
      setForm(buildDefaultForm(lead, slot));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() }),
      ]);
    },
    onError: (error) => {
      toast({
        title: t("bookings.toastCreateFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (input: { path: string; method: "POST" | "PATCH"; body?: Record<string, unknown> }) =>
      customFetch(input.path, {
        method: input.method,
        responseType: "json",
        body: input.body ? JSON.stringify(input.body) : undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() }),
      ]);
    },
  });

  const handleCreate = async () => {
    if (!form.tableId || !form.customerName.trim() || !form.customerPhone.trim() || !form.slotStartAt) {
      toast({
        title: t("bookings.toastMissingFields"),
        variant: "destructive",
      });
      return;
    }
    await createMutation.mutateAsync(form);
  };

  const handleMarkPaidAndConfirm = async (bookingId: number) => {
    try {
      await actionMutation.mutateAsync({
        path: `/api/bookings/${bookingId}/payment-status`,
        method: "PATCH",
        body: { bookingFeePaid: true, preorderAmountPaid: true },
      });
      toast({ title: t("bookings.toastConfirmed") });
    } catch (error) {
      toast({
        title: t("bookings.toastActionFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleCheckIn = async (bookingId: number) => {
    try {
      await actionMutation.mutateAsync({ path: `/api/bookings/${bookingId}/check-in`, method: "POST" });
      toast({ title: t("bookings.toastCheckedIn") });
    } catch (error) {
      toast({
        title: t("bookings.toastActionFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleCheckOut = async (bookingId: number) => {
    try {
      await actionMutation.mutateAsync({ path: `/api/bookings/${bookingId}/check-out`, method: "POST" });
      toast({ title: t("bookings.toastCheckedOut") });
    } catch (error) {
      toast({
        title: t("bookings.toastActionFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (bookingId: number) => {
    try {
      await actionMutation.mutateAsync({
        path: `/api/bookings/${bookingId}/cancel`,
        method: "POST",
        body: {},
      });
      toast({ title: t("bookings.toastCancelled") });
    } catch (error) {
      toast({
        title: t("bookings.toastActionFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleExtend = async (bookingId: number) => {
    const promptValue = window.prompt(t("bookings.extendPrompt"), "30");
    if (!promptValue) return;
    const extendMinutes = Number.parseInt(promptValue, 10);
    if (!Number.isFinite(extendMinutes) || extendMinutes <= 0) {
      toast({
        title: t("bookings.toastInvalidExtend"),
        variant: "destructive",
      });
      return;
    }
    try {
      const result = (await actionMutation.mutateAsync({
        path: `/api/bookings/${bookingId}/extend`,
        method: "POST",
        body: { extendMinutes },
      })) as { additionalFee?: string };
      toast({
        title: t("bookings.toastExtended"),
        description: t("bookings.additionalFeeHint", { fee: result?.additionalFee ?? "0.00" }),
      });
    } catch (error) {
      toast({
        title: t("bookings.toastActionFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  if (tablesLoading || rulesLoading) {
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
          <p className="text-sm text-muted-foreground">{t("bookings.subtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void refetchBookings()} disabled={bookingsLoading}>
          {bookingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("bookings.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("bookings.newBooking")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>{t("bookings.table")}</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.tableId}
              onChange={(event) => setForm((prev) => ({ ...prev, tableId: event.target.value }))}
            >
              <option value="">{t("bookings.selectTable")}</option>
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.tableNumber}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("bookings.availableOnlyHint")}
            </p>
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.customerName")}</Label>
            <Input value={form.customerName} onChange={(event) => setForm((prev) => ({ ...prev, customerName: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.customerPhone")}</Label>
            <Input value={form.customerPhone} onChange={(event) => setForm((prev) => ({ ...prev, customerPhone: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.slotStart")}</Label>
            <Input
              type="datetime-local"
              value={form.slotStartAt}
              onChange={(event) => setForm((prev) => ({ ...prev, slotStartAt: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("bookings.leadTimeHint", { minutes: businessRules?.bookingLeadTimeMinutes ?? 60 })}
            </p>
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.slotMinutes")}</Label>
            <Input
              value={form.slotMinutes}
              onChange={(event) => setForm((prev) => ({ ...prev, slotMinutes: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.autoCancelHint")}</Label>
            <Input disabled value={String(businessRules?.bookingNoShowGraceMinutes ?? 15)} />
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.bookingFee")}</Label>
            <Input value={form.bookingFee} onChange={(event) => setForm((prev) => ({ ...prev, bookingFee: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("bookings.preorderAmount")}</Label>
            <Input value={form.preorderAmount} onChange={(event) => setForm((prev) => ({ ...prev, preorderAmount: event.target.value }))} />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>{t("bookings.notes")}</Label>
            <Textarea rows={2} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.bookingFeePaid}
              onCheckedChange={(value) => setForm((prev) => ({ ...prev, bookingFeePaid: Boolean(value) }))}
            />
            <Label>{t("bookings.bookingFeePaid")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.preorderAmountPaid}
              onCheckedChange={(value) => setForm((prev) => ({ ...prev, preorderAmountPaid: Boolean(value) }))}
            />
            <Label>{t("bookings.preorderPaid")}</Label>
          </div>
          <div className="md:col-span-3">
            <Button className="gap-2" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("bookings.create")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("bookings.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bookings.table")}</TableHead>
                  <TableHead>{t("bookings.customer")}</TableHead>
                  <TableHead>{t("bookings.slot")}</TableHead>
                  <TableHead>{t("bookings.status")}</TableHead>
                  <TableHead>{t("bookings.paid")}</TableHead>
                  <TableHead>{t("bookings.timestamps")}</TableHead>
                  <TableHead>{t("bookings.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookingsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {t("bookings.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell>
                        {tableNumberById.get(booking.tableId) ?? `#${booking.tableId}`}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{booking.customerName}</p>
                        <p className="text-xs text-muted-foreground">{booking.customerPhone}</p>
                      </TableCell>
                      <TableCell>
                        <p>{new Date(booking.slotStartAt).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{t("bookings.to")} {new Date(booking.slotEndAt).toLocaleString()}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusClass(booking.status)}>
                          {t(`bookings.statusValues.${booking.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs">
                          {t("bookings.bookingFee")} {booking.bookingFee} / {booking.bookingFeePaid ? t("common.yes") : t("common.no")}
                        </p>
                        <p className="text-xs">
                          {t("bookings.preorderAmount")} {booking.preorderAmount} / {booking.preorderAmountPaid ? t("common.yes") : t("common.no")}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p>{t("bookings.createdAt")}: {new Date(booking.createdAt).toLocaleString()}</p>
                        <p>{t("bookings.checkInAt")}: {booking.checkInAt ? new Date(booking.checkInAt).toLocaleString() : "-"}</p>
                        <p>{t("bookings.orderAt")}: {booking.orderAt ? new Date(booking.orderAt).toLocaleString() : "-"}</p>
                        <p>{t("bookings.checkOutAt")}: {booking.checkOutAt ? new Date(booking.checkOutAt).toLocaleString() : "-"}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {booking.status === "pending_payment" ? (
                            <Button size="sm" variant="outline" onClick={() => { void handleMarkPaidAndConfirm(booking.id); }}>
                              {t("bookings.confirmPaid")}
                            </Button>
                          ) : null}
                          {booking.status === "confirmed" ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => { void handleCheckIn(booking.id); }}>
                                {t("bookings.checkIn")}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { void handleExtend(booking.id); }}>
                                {t("bookings.extend")}
                              </Button>
                            </>
                          ) : null}
                          {booking.status === "checked_in" ? (
                            <Button size="sm" variant="outline" onClick={() => { void handleCheckOut(booking.id); }}>
                              {t("bookings.checkOut")}
                            </Button>
                          ) : null}
                          {(booking.status === "pending_payment" || booking.status === "confirmed") ? (
                            <Button size="sm" variant="outline" onClick={() => { void handleCancel(booking.id); }}>
                              {t("bookings.cancel")}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
