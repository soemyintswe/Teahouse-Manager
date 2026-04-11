import { Router, type IRouter } from "express";
import { sql, and, gte, lte } from "drizzle-orm";
import { billingAuditLogsTable, db, transactionsTable } from "@workspace/db";
import { requireRoles } from "../lib/auth";
import {
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  CreateTransactionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const FINANCE_VIEW_ROLES = ["cashier", "supervisor", "manager", "owner"] as const;
const FINANCE_MANAGE_ROLES = ["supervisor", "manager", "owner"] as const;

function formatTx(t: typeof transactionsTable.$inferSelect) {
  return { ...t, amount: t.amount.toString(), createdAt: t.createdAt.toISOString() };
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

router.get("/finance/transactions", requireRoles(FINANCE_VIEW_ROLES), async (req, res): Promise<void> => {
  const qp = ListTransactionsQueryParams.safeParse(req.query);
  const conditions = [];
  if (qp.success && qp.data.type) conditions.push(sql`${transactionsTable.type} = ${qp.data.type}`);
  if (qp.success && qp.data.startDate) conditions.push(gte(transactionsTable.createdAt, new Date(qp.data.startDate)));
  if (qp.success && qp.data.endDate) conditions.push(lte(transactionsTable.createdAt, new Date(qp.data.endDate)));

  let txs;
  if (conditions.length > 0) {
    txs = await db.select().from(transactionsTable).where(and(...conditions)).orderBy(sql`${transactionsTable.createdAt} desc`);
  } else {
    txs = await db.select().from(transactionsTable).orderBy(sql`${transactionsTable.createdAt} desc`);
  }
  res.json(ListTransactionsResponse.parse(txs.map(formatTx)));
});

router.post("/finance/transactions", requireRoles(FINANCE_MANAGE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [tx] = await db.insert(transactionsTable).values(parsed.data).returning();
  res.status(201).json(formatTx(tx));
});

router.get("/finance/audit-events", requireRoles(FINANCE_VIEW_ROLES), async (_req, res): Promise<void> => {
  const events = await db
    .select()
    .from(billingAuditLogsTable)
    .orderBy(sql`${billingAuditLogsTable.createdAt} desc`)
    .limit(500);

  res.json(events.map((event) => ({
    id: event.id,
    operation: event.operation,
    mergeGroupId: event.mergeGroupId,
    orderId: event.orderId,
    tableIds: parseJson(event.tableIds ?? null),
    detail: parseJson(event.detail ?? null),
    staffId: event.staffId,
    createdAt: event.createdAt.toISOString(),
  })));
});

export default router;
