import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, paymentsTable, ordersTable, tablesTable } from "@workspace/db";
import {
  ListPaymentsQueryParams,
  ListPaymentsResponse,
  CreatePaymentBody,
  GetPaymentParams,
  GetPaymentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return { ...p, amount: p.amount.toString(), createdAt: p.createdAt.toISOString() };
}

router.get("/payments", async (req, res): Promise<void> => {
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

router.post("/payments", async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

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

  // Mark order as paid and table as dirty
  await db.update(ordersTable).set({ status: "paid", paymentMethod: parsed.data.paymentMethod }).where(eq(ordersTable.id, parsed.data.orderId));
  await db.update(tablesTable).set({ status: "dirty", currentOrderId: null }).where(eq(tablesTable.currentOrderId, parsed.data.orderId));

  res.status(201).json(GetPaymentResponse.parse(formatPayment(payment)));
});

router.get("/payments/:id", async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(GetPaymentResponse.parse(formatPayment(payment)));
});

export default router;
