import { useEffect, useMemo, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SettingsResponse = {
  id: number;
  restaurantName: string;
  taxRate: string;
  airconFee: string;
  currency: string;
  receiptFooter: string | null;
  notifyActivateEmailSubject: string;
  notifyActivateEmailBody: string;
  notifyActivateSmsBody: string;
  notifyResetEmailSubject: string;
  notifyResetEmailBody: string;
  notifyResetSmsBody: string;
  updatedAt: string;
};

type SettingsFormState = {
  restaurantName: string;
  taxRate: string;
  airconFee: string;
  currency: string;
  receiptFooter: string;
  notifyActivateEmailSubject: string;
  notifyActivateEmailBody: string;
  notifyActivateSmsBody: string;
  notifyResetEmailSubject: string;
  notifyResetEmailBody: string;
  notifyResetSmsBody: string;
};

type NotificationLogRecord = {
  id: number;
  customerId: number | null;
  customerName: string | null;
  reason: "account_activated" | "password_reset";
  channel: "email" | "sms";
  provider: string;
  recipient: string | null;
  status: "sent" | "failed" | "skipped";
  message: string | null;
  payload: unknown;
  createdAt: string;
};

type ReasonFilter = "all" | "account_activated" | "password_reset";
type ChannelFilter = "all" | "email" | "sms";
type StatusFilter = "all" | "sent" | "failed" | "skipped";

const SETTINGS_QUERY_KEY = ["settings", "detail"];

function toFormState(settings: SettingsResponse): SettingsFormState {
  return {
    restaurantName: settings.restaurantName,
    taxRate: settings.taxRate,
    airconFee: settings.airconFee,
    currency: settings.currency,
    receiptFooter: settings.receiptFooter ?? "",
    notifyActivateEmailSubject: settings.notifyActivateEmailSubject,
    notifyActivateEmailBody: settings.notifyActivateEmailBody,
    notifyActivateSmsBody: settings.notifyActivateSmsBody,
    notifyResetEmailSubject: settings.notifyResetEmailSubject,
    notifyResetEmailBody: settings.notifyResetEmailBody,
    notifyResetSmsBody: settings.notifyResetSmsBody,
  };
}

function getReasonLabel(reason: NotificationLogRecord["reason"]): string {
  return reason === "account_activated" ? "Account Activated" : "Password Reset";
}

function getStatusClass(status: NotificationLogRecord["status"]): string {
  if (status === "sent") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "failed") return "bg-red-100 text-red-700 border-red-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [logLimit, setLogLimit] = useState<string>("100");
  const [form, setForm] = useState<SettingsFormState | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => customFetch<SettingsResponse>("/api/settings", { method: "GET", responseType: "json" }),
    staleTime: 10000,
  });

  useEffect(() => {
    if (!settings) return;
    setForm((prev) => prev ?? toFormState(settings));
  }, [settings]);

  const logsQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (reasonFilter !== "all") query.set("reason", reasonFilter);
    if (channelFilter !== "all") query.set("channel", channelFilter);
    if (statusFilter !== "all") query.set("status", statusFilter);
    const normalizedLimit = Number.parseInt(logLimit, 10);
    query.set("limit", Number.isFinite(normalizedLimit) && normalizedLimit > 0 ? String(normalizedLimit) : "100");
    return query.toString();
  }, [reasonFilter, channelFilter, statusFilter, logLimit]);

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["settings", "notification-logs", logsQuery],
    queryFn: () =>
      customFetch<NotificationLogRecord[]>(`/api/settings/notification-logs?${logsQuery}`, {
        method: "GET",
        responseType: "json",
      }),
    refetchInterval: 20000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: SettingsFormState) => {
      return customFetch<SettingsResponse>("/api/settings", {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({
          ...payload,
          receiptFooter: payload.receiptFooter.trim().length > 0 ? payload.receiptFooter : null,
        }),
      });
    },
    onSuccess: async (saved) => {
      toast({ title: "Settings saved successfully." });
      setForm(toFormState(saved));
      await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (settingsLoading || form == null) {
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
          <h1 className="page-title">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Customize account activation/reset templates and review notification delivery history.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Restaurant Name</Label>
            <Input
              value={form.restaurantName}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, restaurantName: event.target.value } : prev))}
            />
          </div>
          <div className="space-y-1">
            <Label>Tax Rate (%)</Label>
            <Input
              value={form.taxRate}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, taxRate: event.target.value } : prev))}
            />
          </div>
          <div className="space-y-1">
            <Label>Aircon Fee</Label>
            <Input
              value={form.airconFee}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, airconFee: event.target.value } : prev))}
            />
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Input
              value={form.currency}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, currency: event.target.value } : prev))}
            />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>Receipt Footer</Label>
            <Input
              value={form.receiptFooter}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, receiptFooter: event.target.value } : prev))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Activated Template</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Placeholder support: {"{{fullName}}"}, {"{{temporaryPassword}}"}, {"{{reasonLabel}}"}, {"{{customerId}}"}
          </p>
          <div className="space-y-1">
            <Label>Email Subject</Label>
            <Input
              value={form.notifyActivateEmailSubject}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, notifyActivateEmailSubject: event.target.value } : prev))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Email Body</Label>
            <Textarea
              rows={7}
              value={form.notifyActivateEmailBody}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, notifyActivateEmailBody: event.target.value } : prev))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>SMS Body</Label>
            <Textarea
              rows={3}
              value={form.notifyActivateSmsBody}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, notifyActivateSmsBody: event.target.value } : prev))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password Reset Template</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Placeholder support: {"{{fullName}}"}, {"{{temporaryPassword}}"}, {"{{reasonLabel}}"}, {"{{customerId}}"}
          </p>
          <div className="space-y-1">
            <Label>Email Subject</Label>
            <Input
              value={form.notifyResetEmailSubject}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, notifyResetEmailSubject: event.target.value } : prev))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Email Body</Label>
            <Textarea
              rows={7}
              value={form.notifyResetEmailBody}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, notifyResetEmailBody: event.target.value } : prev))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>SMS Body</Label>
            <Textarea
              rows={3}
              value={form.notifyResetSmsBody}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, notifyResetSmsBody: event.target.value } : prev))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Notification History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-5">
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={reasonFilter} onValueChange={(value) => setReasonFilter(value as ReasonFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="account_activated">Account Activated</SelectItem>
                  <SelectItem value="password_reset">Password Reset</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Channel</Label>
              <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as ChannelFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Limit</Label>
              <Input value={logLimit} onChange={(event) => setLogLimit(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full gap-2" onClick={() => void refetchLogs()} disabled={logsLoading}>
                {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No notification logs found for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{log.customerName ?? "-"}</TableCell>
                      <TableCell>{getReasonLabel(log.reason)}</TableCell>
                      <TableCell className="uppercase">{log.channel}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getStatusClass(log.status)}`}>
                          {log.status}
                        </span>
                      </TableCell>
                      <TableCell>{log.provider}</TableCell>
                      <TableCell>{log.recipient ?? "-"}</TableCell>
                      <TableCell className="max-w-[360px] truncate" title={log.message ?? ""}>
                        {log.message ?? "-"}
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
