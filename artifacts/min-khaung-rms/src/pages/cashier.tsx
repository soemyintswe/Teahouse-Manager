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

export default function CashierPage() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const orderId = useMemo(() => parseOrderId(search), [search]);
  const walletFromUrl = useMemo(() => parseWallet(search), [search]);
  const [wallet, setWallet] = useState<WalletCode>(walletFromUrl);

  const { data: order, isLoading: orderLoading } = useGetOrder(orderId ?? 0, {
    query: {
      enabled: orderId != null,
      queryKey: getGetOrderQueryKey(orderId ?? 0),
      refetchInterval: 15000,
    },
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

  const createPayment = useCreatePayment();

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

  if (orderLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!orderId || !order) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{t("cashier.orderRequired")}</p>
        <Button variant="outline" onClick={() => setLocation("/orders")}>
          {t("cashier.goOrders")}
        </Button>
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
