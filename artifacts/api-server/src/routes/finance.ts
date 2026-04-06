import { Router, type IRouter } from "express";
import { sql, and, gte, lte } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import {
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  CreateTransactionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatTx(t: typeof transactionsTable.$inferSelect) {
  return { ...t, amount: t.amount.toString(), createdAt: t.createdAt.toISOString() };
}

router.get("/finance/transactions", async (req, res): Promise<void> => {
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

router.post("/finance/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [tx] = await db.insert(transactionsTable).values(parsed.data).returning();
  res.status(201).json(formatTx(tx));
});

export default router;
