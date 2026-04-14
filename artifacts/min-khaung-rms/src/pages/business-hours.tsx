import { useEffect, useMemo, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BusinessHoursResponse = {
  bookingLeadTimeMinutes: number;
  bookingNoShowGraceMinutes: number;
  bookingDefaultSlotMinutes: number;
  businessOpenTime: string;
  businessCloseTime: string;
  businessClosedWeekdays: number[];
  businessClosedDates: string[];
  updatedAt: string;
};

type BusinessHoursForm = {
  bookingLeadTimeMinutes: string;
  bookingNoShowGraceMinutes: string;
  bookingDefaultSlotMinutes: string;
  businessOpenTime: string;
  businessCloseTime: string;
  businessClosedWeekdays: string;
  businessClosedDates: string;
};

const BUSINESS_HOURS_QUERY_KEY = ["settings", "business-hours"];

function toFormState(value: BusinessHoursResponse): BusinessHoursForm {
  return {
    bookingLeadTimeMinutes: String(value.bookingLeadTimeMinutes),
    bookingNoShowGraceMinutes: String(value.bookingNoShowGraceMinutes),
    bookingDefaultSlotMinutes: String(value.bookingDefaultSlotMinutes),
    businessOpenTime: value.businessOpenTime,
    businessCloseTime: value.businessCloseTime,
    businessClosedWeekdays: value.businessClosedWeekdays.join(", "),
    businessClosedDates: value.businessClosedDates.join("\n"),
  };
}

function parseWeekdays(raw: string): number[] {
  return [...new Set(
    raw
      .split(",")
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6),
  )];
}

function parseClosedDates(raw: string): string[] {
  return [...new Set(
    raw
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry)),
  )];
}

export default function BusinessHoursPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState<BusinessHoursForm | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: BUSINESS_HOURS_QUERY_KEY,
    queryFn: () => customFetch<BusinessHoursResponse>("/api/settings/business-hours", { method: "GET", responseType: "json" }),
  });

  useEffect(() => {
    if (!data) return;
    setForm((prev) => prev ?? toFormState(data));
  }, [data]);

  const weekdayExamples = useMemo(
    () => t("businessHours.weekdayHelper"),
    [t],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: BusinessHoursForm) =>
      customFetch<BusinessHoursResponse>("/api/settings/business-hours", {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({
          bookingLeadTimeMinutes: Number.parseInt(payload.bookingLeadTimeMinutes, 10),
          bookingNoShowGraceMinutes: Number.parseInt(payload.bookingNoShowGraceMinutes, 10),
          bookingDefaultSlotMinutes: Number.parseInt(payload.bookingDefaultSlotMinutes, 10),
          businessOpenTime: payload.businessOpenTime.trim(),
          businessCloseTime: payload.businessCloseTime.trim(),
          businessClosedWeekdays: parseWeekdays(payload.businessClosedWeekdays),
          businessClosedDates: parseClosedDates(payload.businessClosedDates),
        }),
      }),
    onSuccess: (updated) => {
      setForm(toFormState(updated));
      toast({ title: t("businessHours.toastSaved") });
    },
    onError: (error) => {
      toast({
        title: t("businessHours.toastSaveFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    },
  });

  if (isLoading || !form) {
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
          <h1 className="page-title">{t("businessHours.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("businessHours.subtitle")}</p>
        </div>
        <Button
          className="gap-2"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("businessHours.save")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("businessHours.bookingRules")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>{t("businessHours.leadTimeMinutes")}</Label>
            <Input
              value={form.bookingLeadTimeMinutes}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, bookingLeadTimeMinutes: event.target.value } : prev))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("businessHours.noShowGraceMinutes")}</Label>
            <Input
              value={form.bookingNoShowGraceMinutes}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, bookingNoShowGraceMinutes: event.target.value } : prev))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("businessHours.defaultSlotMinutes")}</Label>
            <Input
              value={form.bookingDefaultSlotMinutes}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, bookingDefaultSlotMinutes: event.target.value } : prev))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("businessHours.businessWindow")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("businessHours.openTime")}</Label>
            <Input
              value={form.businessOpenTime}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, businessOpenTime: event.target.value } : prev))}
              placeholder="08:00"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("businessHours.closeTime")}</Label>
            <Input
              value={form.businessCloseTime}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, businessCloseTime: event.target.value } : prev))}
              placeholder="22:00"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("businessHours.closedWeekdays")}</Label>
            <Input
              value={form.businessClosedWeekdays}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, businessClosedWeekdays: event.target.value } : prev))}
              placeholder="0, 1"
            />
            <p className="text-xs text-muted-foreground">{weekdayExamples}</p>
          </div>
          <div className="space-y-1">
            <Label>{t("businessHours.closedDates")}</Label>
            <Textarea
              rows={4}
              value={form.businessClosedDates}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, businessClosedDates: event.target.value } : prev))}
              placeholder="2026-01-01"
            />
            <p className="text-xs text-muted-foreground">{t("businessHours.closedDateHelper")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("businessHours.lastUpdated")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "-"}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("businessHours.refresh")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
