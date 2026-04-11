import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  customFetch,
  useCreatePayment,
  useGetOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
  getListPaymentsQueryKey,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CreditCard, Loader2, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const WALLET_OPTIONS = ["wave_pay", "kbz_pay", "aya_pay", "cb_pay"] as const;
type WalletCode = (typeof WALLET_OPTIONS)[number];

type PaymentQrPreview = {
  orderId: number;
  tableNumber: string;
  amount: string;
  wallet: WalletCode;
  payload: string;
  paymentUrl: string;
  qrImageUrl: string;
  issuedAt: string;
};

type PaymentRecord = {
  id: number;
  orderId: number;
  tableNumber: string;
  amount: string;
  paymentMethod: string;
  status: string;
  cashierId: number | null;
  receiptNumber: string;
  createdAt: string;
};

type CashierOrderPick = {
  id: number;
  tableNumber: string;
  totalAmount: string;
  status: string;
  createdAt: string;
};

function parseOrderId(search: string): number | null {
  const value = new URLSearchParams(search).get("orderId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseWallet(search: string): WalletCode {
  const value = new URLSearchParams(search).get("wallet");
  if (value && WALLET_OPTIONS.includes(value as WalletCode)) {
    return value as WalletCode;
  }
  return "wave_pay";
}

function formatAmount(value: string | number): string {
  return `${Number(value).toLocaleString()} ks`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function CashierPage() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const orderId = useMemo(() => parseOrderId(search), [search]);
  const walletFromUrl = useMemo(() => parseWallet(search), [search]);
  const [wallet, setWallet] = useState<WalletCode>(walletFromUrl);
  const [splitGroups, setSplitGroups] = useState("2");
  const [isSplitting, setIsSplitting] = useState(false);

  const { data: order, isLoading: orderLoading } = useGetOrder(orderId ?? 0, {
    query: {
      enabled: orderId != null,
      queryKey: getGetOrderQueryKey(orderId ?? 0),
      refetchInterval: 15000,
    },
  });

  const { data: readyToPayOrders = [], isLoading: readyToPayLoading } = useQuery({
    queryKey: ["cashier-order-pick", "ready_to_pay"],
    enabled: orderId == null,
    queryFn: () =>
      customFetch<CashierOrderPick[]>("/api/orders?status=ready_to_pay", {
        method: "GET",
        responseType: "json",
      }),
    refetchInterval: 15000,
  });
  const { data: openOrders = [], isLoading: openLoading } = useQuery({
    queryKey: ["cashier-order-pick", "open"],
    enabled: orderId == null,
    queryFn: () =>
      customFetch<CashierOrderPick[]>("/api/orders?status=open", {
        method: "GET",
        responseType: "json",
      }),
    refetchInterval: 15000,
  });

  const shouldLoadQr = Boolean(orderId && order && (order.status === "open" || order.status === "ready_to_pay"));
  const { data: qrPreview, isLoading: qrLoading } = useQuery({
    queryKey: ["payment-qr-preview", orderId, wallet],
    enabled: shouldLoadQr,
    queryFn: () =>
      customFetch<PaymentQrPreview>(`/api/payments/orders/${orderId}/qr?wallet=${wallet}`, {
        method: "GET",
        responseType: "json",
      }),
    refetchInterval: 20000,
  });

  const { data: latestPayment, isLoading: latestPaymentLoading } = useQuery({
    queryKey: ["payment-latest", orderId],
    enabled: Boolean(orderId && order?.status === "paid"),
    retry: false,
    queryFn: () =>
      customFetch<PaymentRecord>(`/api/payments/order/${orderId}/latest`, {
        method: "GET",
        responseType: "json",
      }),
  });

  const createPayment = useCreatePayment();

  const openReceiptWindow = (payment: PaymentRecord, autoPrint: boolean) => {
    if (!order || typeof window === "undefined") return;
    const walletLabel = payment.paymentMethod.startsWith("cash")
      ? t("public.checkout.paymentCash")
      : t(`cashier.wallet.${payment.paymentMethod}`);
    const issuedAt = new Date(payment.createdAt).toLocaleString();
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(t("cashier.receipt.title"))}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #111827; }
      .card { max-width: 420px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; }
      h1 { margin: 0 0 4px 0; font-size: 22px; }
      .muted { color: #6b7280; font-size: 12px; }
      .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
      .total { margin-top: 12px; border-top: 1px dashed #9ca3af; padding-top: 10px; font-weight: 700; font-size: 16px; }
      .footer { margin-top: 16px; font-size: 12px; color: #6b7280; text-align: center; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(t("cashier.receipt.title"))}</h1>
      <div class="muted">${escapeHtml(t("cashier.receipt.number"))}: ${escapeHtml(payment.receiptNumber)}</div>
      <div class="muted">${escapeHtml(issuedAt)}</div>

      <div class="row"><span>${escapeHtml(t("cashier.receipt.order"))}</span><span>#${order.id}</span></div>
      <div class="row"><span>${escapeHtml(t("cashier.receipt.table"))}</span><span>${escapeHtml(order.tableNumber)}</span></div>
      <div class="row"><span>${escapeHtml(t("orders.subtotal"))}</span><span>${escapeHtml(formatAmount(order.subtotal))}</span></div>
      <div class="row"><span>${escapeHtml(t("orderDetail.tax"))}</span><span>${escapeHtml(formatAmount(order.taxAmount))}</span></div>
      <div class="row total"><span>${escapeHtml(t("orders.total"))}</span><span>${escapeHtml(formatAmount(order.totalAmount))}</span></div>
      <div class="row"><span>${escapeHtml(t("cashier.receipt.paymentMethod"))}</span><span>${escapeHtml(walletLabel)}</span></div>
      <div class="footer">${escapeHtml(t("cashier.receipt.footer"))}</div>
    </div>
  </body>
</html>`;

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    if (autoPrint) {
      window.setTimeout(() => {
        popup.focus();
        popup.print();
      }, 250);
    }
  };

  const handleConfirmPayment = async () => {
    if (!orderId) return;
    try {
      await createPayment.mutateAsync({
        data: {
          orderId,
          paymentMethod: wallet,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) }),
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["payment-latest", orderId] }),
      ]);
      toast({ title: t("cashier.paymentSuccess") });
    } catch (error) {
      toast({
        title: t("cashier.paymentFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleSplitBillEvenly = async () => {
    if (!orderId || isSplitting) return;
    const groups = Number.parseInt(splitGroups, 10);
    if (!Number.isFinite(groups) || groups < 2 || groups > 8) {
      toast({
        title: "Invalid split group count",
        description: "Split groups must be between 2 and 8.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSplitting(true);
      await customFetch(`/api/orders/${orderId}/split-evenly`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ groups }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() }),
      ]);
      toast({ title: `Bill split into ${groups} groups successfully.` });
      setLocation("/cashier");
    } catch (error) {
      toast({
        title: "Failed to split bill",
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setIsSplitting(false);
    }
  };

  if (orderLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!orderId || !order) {
    const pickOrders = [...readyToPayOrders, ...openOrders];
    const isPickLoading = readyToPayLoading || openLoading;
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div>
          <h1 className="page-title">{t("cashier.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("cashier.orderRequired")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{t("cashier.selectOrderTitle")}</h2>
          {isPickLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : pickOrders.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">{t("cashier.noOrdersToPay")}</div>
          ) : (
            <div className="mt-3 grid gap-2">
              {pickOrders.map((pick) => (
                <button
                  key={`pick-${pick.id}`}
                  className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/30"
                  onClick={() => setLocation(`/cashier?orderId=${pick.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      #{pick.id} · {pick.tableNumber}
                    </p>
                    <Badge variant={pick.status === "ready_to_pay" ? "default" : "outline"}>
                      {t("orders.status." + (pick.status === "ready_to_pay" ? "readyToPay" : pick.status))}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAmount(pick.totalAmount)} · {new Date(pick.createdAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Button variant="outline" onClick={() => setLocation("/orders")}>
            {t("cashier.goOrders")}
          </Button>
        </div>
      </div>
    );
  }

  const isPaid = order.status === "paid";
  const isPayable = order.status === "open" || order.status === "ready_to_pay";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setLocation(`/orders/${order.id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="page-title">{t("cashier.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("cashier.subtitle", { id: order.id, table: order.tableNumber })}</p>
        </div>
        <Badge variant="outline" className="ml-auto">
          {t("orders.status." + (order.status === "ready_to_pay" ? "readyToPay" : order.status))}
        </Badge>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{t("orders.subtotal")}</p>
            <p className="text-lg font-bold">{formatAmount(order.subtotal)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{t("orderDetail.tax")}</p>
            <p className="text-lg font-bold">{formatAmount(order.taxAmount)}</p>
          </div>
          <div className="rounded-lg border bg-primary/10 p-3">
            <p className="text-xs text-muted-foreground">{t("orders.total")}</p>
            <p className="text-2xl font-black text-primary">{formatAmount(order.totalAmount)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{t("cashier.walletSelect")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WALLET_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={wallet === option ? "default" : "outline"}
              onClick={() => setWallet(option)}
              disabled={!isPayable || isPaid}
            >
              {t(`cashier.wallet.${option}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{t("cashier.qrTitle")}</h2>
        </div>

        {!isPayable && !isPaid ? (
          <p className="text-sm text-muted-foreground">{t("cashier.notPayable")}</p>
        ) : qrLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : qrPreview ? (
          <div className="space-y-3">
            <div className="flex justify-center rounded-lg border bg-white p-3">
              <img src={qrPreview.qrImageUrl} alt="Payment QR" className="h-72 w-72 max-w-full rounded-md" />
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs break-all">{qrPreview.payload}</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.open(qrPreview.paymentUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                {t("cashier.openPayLink")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    void window.navigator.clipboard.writeText(qrPreview.payload);
                  }
                  toast({ title: t("cashier.payloadCopied") });
                }}
              >
                {t("cashier.copyPayload")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("cashier.noQrYet")}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {isPayable && !isPaid ? (
          <div className="mr-auto flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Split Bill</span>
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={splitGroups}
              onChange={(event) => setSplitGroups(event.target.value)}
              disabled={isSplitting || createPayment.isPending}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((value) => (
                <option key={value} value={value}>{value} groups</option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => void handleSplitBillEvenly()}
              disabled={isSplitting || createPayment.isPending || (order.items?.length ?? 0) === 0}
            >
              {isSplitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Split
            </Button>
          </div>
        ) : null}
        {isPaid ? (
          <>
            <Button
              variant="outline"
              onClick={() => latestPayment && openReceiptWindow(latestPayment, false)}
              disabled={!latestPayment || latestPaymentLoading}
            >
              {t("cashier.receipt.viewSoft")}
            </Button>
            <Button
              variant="outline"
              onClick={() => latestPayment && openReceiptWindow(latestPayment, true)}
              disabled={!latestPayment || latestPaymentLoading}
            >
              {t("cashier.receipt.printHard")}
            </Button>
          </>
        ) : null}
        <Button variant="outline" onClick={() => setLocation(`/orders/${order.id}`)}>
          {t("cashier.backOrder")}
        </Button>
        <Button
          onClick={handleConfirmPayment}
          disabled={!isPayable || isPaid || createPayment.isPending}
          className="min-w-[210px]"
        >
          {createPayment.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="mr-2 h-4 w-4" />
          )}
          {isPaid ? t("cashier.alreadyPaid") : t("cashier.confirmPaid")}
        </Button>
      </div>
    </div>
  );
}
