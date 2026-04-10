import { useMemo, useState } from "react";
import {
  useListPayments,
  useListTransactions,
  useCreateTransaction,
  getListPaymentsQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { Payment, Transaction } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Plus, WalletCards } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ManualType = "deposit" | "income" | "expense" | "withdrawal";
type SourceFilter = "all" | "payment" | "manual";

type LedgerEntry = {
  id: string;
  createdAt: string;
  source: "payment" | "manual";
  type: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  referenceNumber: string | null;
  paymentMethod: string | null;
  orderId: number | null;
  tableNumber: string | null;
};

const MANUAL_TYPE_OPTIONS: ManualType[] = ["expense", "withdrawal", "deposit", "income"];
const POSITIVE_TYPES = new Set<string>(["deposit", "income"]);
const NEGATIVE_TYPES = new Set<string>(["expense", "withdrawal"]);

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function amountToNumber(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inDateRange(iso: string, startDate: string, endDate: string): boolean {
  if (!startDate && !endDate) return true;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    if (!Number.isNaN(start) && ts < start) return false;
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`).getTime();
    if (!Number.isNaN(end) && ts > end) return false;
  }
  return true;
}

function classifyManualDirection(type: string): "in" | "out" {
  const normalized = type.trim().toLowerCase();
  if (POSITIVE_TYPES.has(normalized)) return "in";
  if (NEGATIVE_TYPES.has(normalized)) return "out";
  return "out";
}

function formatAmount(value: number): string {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ks`;
}

export default function FinancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return toDateInputValue(d);
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(today));
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [manualType, setManualType] = useState<ManualType>("expense");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualReference, setManualReference] = useState("");

  const canManageTransactions = user?.role === "supervisor" || user?.role === "manager" || user?.role === "owner";

  const { data: payments = [], isLoading: paymentsLoading } = useListPayments(
    { status: "completed" },
    { query: { queryKey: getListPaymentsQueryKey({ status: "completed" }), refetchInterval: 20000 } },
  );
  const { data: transactions = [], isLoading: transactionsLoading } = useListTransactions(undefined, {
    query: { queryKey: getListTransactionsQueryKey(), refetchInterval: 20000 },
  });
  const createTransaction = useCreateTransaction();

  const isLoading = paymentsLoading || transactionsLoading;

  const ledger = useMemo<LedgerEntry[]>(() => {
    const paymentEntries = (payments as Payment[]).map((payment) => ({
      id: `payment-${payment.id}`,
      createdAt: payment.createdAt,
      source: "payment" as const,
      type: "sale",
      direction: "in" as const,
      amount: amountToNumber(payment.amount),
      description: `Order #${payment.orderId} · Table ${payment.tableNumber}`,
      referenceNumber: payment.receiptNumber ?? null,
      paymentMethod: payment.paymentMethod ?? null,
      orderId: payment.orderId,
      tableNumber: payment.tableNumber ?? null,
    }));

    const manualEntries = (transactions as Transaction[]).map((tx) => ({
      id: `manual-${tx.id}`,
      createdAt: tx.createdAt,
      source: "manual" as const,
      type: (tx.type ?? "").toLowerCase() || "expense",
      direction: classifyManualDirection(tx.type ?? ""),
      amount: amountToNumber(tx.amount),
      description: tx.description,
      referenceNumber: tx.referenceNumber ?? null,
      paymentMethod: null,
      orderId: null,
      tableNumber: null,
    }));

    return [...paymentEntries, ...manualEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [payments, transactions]);

  const filteredLedger = useMemo(() => {
    return ledger.filter((entry) => {
      if (!inDateRange(entry.createdAt, startDate, endDate)) return false;
      if (sourceFilter !== "all" && entry.source !== sourceFilter) return false;
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      return true;
    });
  }, [ledger, startDate, endDate, sourceFilter, typeFilter]);

  const summary = useMemo(() => {
    let sales = 0;
    let manualIncome = 0;
    let manualExpense = 0;

    for (const entry of filteredLedger) {
      if (entry.source === "payment") {
        sales += entry.amount;
      } else if (entry.direction === "in") {
        manualIncome += entry.amount;
      } else {
        manualExpense += entry.amount;
      }
    }

    return {
      sales,
      manualIncome,
      manualExpense,
      net: sales + manualIncome - manualExpense,
      count: filteredLedger.length,
    };
  }, [filteredLedger]);

  const typeValues = useMemo(() => {
    const values = new Set<string>(["sale"]);
    for (const entry of ledger) values.add(entry.type);
    return [...values];
  }, [ledger]);

  const typeLabel = (value: string): string => {
    const key = `finance.types.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  const setPresetRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
  };

  const handleCreateManualTransaction = async () => {
    if (!canManageTransactions) return;

    const amount = Number(manualAmount);
    if (!Number.isFinite(amount) || amount <= 0 || manualDescription.trim().length === 0) {
      toast({
        title: t("finance.addFailed"),
        description: t("finance.validation"),
        variant: "destructive",
      });
      return;
    }

    try {
      await createTransaction.mutateAsync({
        data: {
          type: manualType,
          amount: amount.toFixed(2),
          description: manualDescription.trim(),
          referenceNumber: manualReference.trim() || undefined,
          staffId: user?.staffId ?? undefined,
        },
      });
      setManualAmount("");
      setManualDescription("");
      setManualReference("");
      await queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      toast({ title: t("finance.addSuccess") });
    } catch (error) {
      toast({
        title: t("finance.addFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
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
          <h1 className="page-title">{t("finance.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("finance.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPresetRange(1)}>{t("finance.range.today")}</Button>
          <Button variant="outline" size="sm" onClick={() => setPresetRange(7)}>{t("finance.range.last7")}</Button>
          <Button variant="outline" size="sm" onClick={() => setPresetRange(30)}>{t("finance.range.last30")}</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("finance.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <Label>{t("finance.startDate")}</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("finance.endDate")}</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("finance.source")}</Label>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("finance.sourceAll")}</SelectItem>
                <SelectItem value="payment">{t("finance.sourcePayment")}</SelectItem>
                <SelectItem value="manual">{t("finance.sourceManual")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("finance.type")}</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("finance.typeAll")}</SelectItem>
                {typeValues.map((value) => (
                  <SelectItem key={value} value={value}>{typeLabel(value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSourceFilter("all");
                setTypeFilter("all");
              }}
            >
              {t("common.clearFilter")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("finance.cards.sales")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-700">{formatAmount(summary.sales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("finance.cards.manualIncome")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
            <div className="text-xl font-bold text-emerald-700">{formatAmount(summary.manualIncome)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("finance.cards.manualExpense")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4 text-rose-600" />
            <div className="text-xl font-bold text-rose-700">{formatAmount(summary.manualExpense)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("finance.cards.netCash")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-primary" />
            <div className={`text-xl font-black ${summary.net >= 0 ? "text-primary" : "text-rose-700"}`}>
              {formatAmount(summary.net)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("finance.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canManageTransactions ? (
            <p className="text-sm text-muted-foreground">{t("finance.readOnlyHint")}</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>{t("finance.type")}</Label>
              <Select value={manualType} onValueChange={(v) => setManualType(v as ManualType)} disabled={!canManageTransactions}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>{typeLabel(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("finance.amount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                disabled={!canManageTransactions}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>{t("finance.description")}</Label>
              <Input
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                disabled={!canManageTransactions}
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>{t("finance.reference")}</Label>
              <Input
                value={manualReference}
                onChange={(e) => setManualReference(e.target.value)}
                placeholder={t("finance.referencePlaceholder")}
                disabled={!canManageTransactions}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full gap-2"
                onClick={() => void handleCreateManualTransaction()}
                disabled={!canManageTransactions || createTransaction.isPending}
              >
                {createTransaction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("finance.addAction")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("finance.ledgerTitle")} · {t("finance.totalRecords", { count: summary.count })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance.columns.date")}</TableHead>
                  <TableHead>{t("finance.columns.source")}</TableHead>
                  <TableHead>{t("finance.columns.type")}</TableHead>
                  <TableHead>{t("finance.columns.description")}</TableHead>
                  <TableHead>{t("finance.columns.reference")}</TableHead>
                  <TableHead className="text-right">{t("finance.columns.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLedger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {t("finance.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLedger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {entry.source === "payment" ? t("finance.sourcePayment") : t("finance.sourceManual")}
                        </Badge>
                      </TableCell>
                      <TableCell>{typeLabel(entry.type)}</TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="truncate">{entry.description}</div>
                        {entry.paymentMethod ? (
                          <div className="text-xs text-muted-foreground">
                            {t("finance.paymentMethod")}: {entry.paymentMethod}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{entry.referenceNumber || "-"}</TableCell>
                      <TableCell className={`text-right font-semibold ${entry.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                        {entry.direction === "in" ? "+" : "-"} {formatAmount(entry.amount)}
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

