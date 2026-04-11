import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, paymentsTable, ordersTable, tablesTable } from "@workspace/db";
import { canAccessTable, requireAuth, requireRoles } from "../lib/auth";
import {
  ListPaymentsQueryParams,
  ListPaymentsResponse,
  CreatePaymentBody,
  GetPaymentParams,
  GetPaymentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const SUPPORTED_WALLETS = ["wave_pay", "kbz_pay", "aya_pay", "cb_pay"] as const;
type SupportedWallet = (typeof SUPPORTED_WALLETS)[number];

function parseOrderId(input: string | string[] | undefined): number | null {
  const value = Array.isArray(input) ? input[0] : input;
  if (!value) return null;
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseWallet(input: unknown): SupportedWallet | null {
  if (typeof input !== "string") return null;
  return (SUPPORTED_WALLETS as readonly string[]).includes(input) ? (input as SupportedWallet) : null;
}

function getWebBaseUrl(reqProtocol: string, reqHost: string | undefined): string {
  const configured = process.env.WEB_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (reqHost) return `${reqProtocol}://${reqHost}`.replace(/\/+$/, "");
  return "https://teahouse-web.onrender.com";
}

function buildPaymentPayload(input: {
  orderId: number;
  tableNumber: string;
  amount: string;
  wallet: SupportedWallet;
  issuedAt: string;
}): string {
  return [
    "TEAHOUSE_PAY",
    `order=${input.orderId}`,
    `table=${encodeURIComponent(input.tableNumber)}`,
    `amount=${encodeURIComponent(input.amount)}`,
    `wallet=${input.wallet}`,
    `issuedAt=${encodeURIComponent(input.issuedAt)}`,
  ].join("|");
}

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return { ...p, amount: p.amount.toString(), createdAt: p.createdAt.toISOString() };
}

router.get("/payments", requireRoles(["cashier", "supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const qp = ListPaymentsQueryParams.safeParse(req.query);
  const conditions = [];
  if (qp.success && qp.data.status) conditions.push(eq(paymentsTable.status, qp.data.status));

  let payments;
  if (conditions.length > 0) {
    payments = await db.select().from(paymentsTable).where(and(...conditions)).orderBy(sql`${paymentsTable.createdAt} desc`);
  } else {
    payments = await db.select().from(paymentsTable).orderBy(sql`${paymentsTable.createdAt} desc`);
  }
  res.json(ListPaymentsResponse.parse(payments.map(formatPayment)));
});

router.get("/payments/orders/:orderId/qr", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseOrderId(req.params.orderId);
  if (!orderId) {
    res.status(400).json({ error: "Invalid order id." });
    return;
  }

  const wallet = parseWallet(req.query.wallet);
  if (!wallet) {
    res.status(400).json({ error: "wallet query is required (wave_pay, kbz_pay, aya_pay, cb_pay)." });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status === "cancelled") {
    res.status(409).json({ error: "Cancelled order cannot be paid." });
    return;
  }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }

  const amount = order.totalAmount.toString();
  const nowIso = new Date().toISOString();
  const webBaseUrl = getWebBaseUrl(req.protocol, req.get("host"));
  const paymentUrl = `${webBaseUrl}/cashier?orderId=${order.id}&wallet=${wallet}`;
  const payload = buildPaymentPayload({
    orderId: order.id,
    tableNumber: order.tableNumber,
    amount,
    wallet,
    issuedAt: nowIso,
  });
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;

  res.json({
    orderId: order.id,
    tableNumber: order.tableNumber,
    amount,
    wallet,
    payload,
    paymentUrl,
    qrImageUrl,
    issuedAt: nowIso,
  });
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }

  const receiptNumber = `RCP-${Date.now()}-${order.id}`;
  const [payment] = await db.insert(paymentsTable).values({
    orderId: parsed.data.orderId,
    tableNumber: order.tableNumber,
    amount: order.totalAmount,
    paymentMethod: parsed.data.paymentMethod,
    cashierId: parsed.data.cashierId ?? null,
    receiptNumber,
    status: "completed",
  }).returning();

  // Mark order as paid, but keep table occupied until manual checkout.
  await db.update(ordersTable).set({ status: "paid", paymentMethod: parsed.data.paymentMethod }).where(eq(ordersTable.id, parsed.data.orderId));
  await db.update(tablesTable).set({ occupancyStatus: "paid", currentOrderId: parsed.data.orderId }).where(eq(tablesTable.id, order.tableId));

  res.status(201).json(GetPaymentResponse.parse(formatPayment(payment)));
});

router.get("/payments/order/:orderId/latest", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseOrderId(req.params.orderId);
  if (!orderId) {
    res.status(400).json({ error: "Invalid order id." });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, order.id))
    .orderBy(sql`${paymentsTable.createdAt} desc`);

  if (!payment) {
    res.status(404).json({ error: "Payment receipt not found for this order." });
    return;
  }

  res.json(GetPaymentResponse.parse(formatPayment(payment)));
});

router.get("/payments/:id", requireRoles(["cashier", "supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(GetPaymentResponse.parse(formatPayment(payment)));
});

export default router;
