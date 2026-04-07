import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tablesTable } from "@workspace/db";
import {
  CreateTableBody,
  GetTableParams,
  GetTableResponse,
  UpdateTableParams,
  UpdateTableBody,
  UpdateTableResponse,
  DeleteTableParams,
  ListTablesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tables", async (_req, res): Promise<void> => {
  const tables = await db.select().from(tablesTable).orderBy(tablesTable.zone, tablesTable.tableNumber);
  res.json(ListTablesResponse.parse(tables.map(t => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))));
});

router.post("/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const qrCode = `table-${parsed.data.tableNumber}-${Date.now()}`;
  const [table] = await db.insert(tablesTable).values({ ...parsed.data, qrCode }).returning();
  res.status(201).json(GetTableResponse.parse({
    ...table,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  }));
});

router.get("/tables/:id", async (req, res): Promise<void> => {
  const params = GetTableParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(GetTableResponse.parse({ ...table, createdAt: table.createdAt.toISOString(), updatedAt: table.updatedAt.toISOString() }));
});

router.post("/tables/:id/scan", async (req, res): Promise<void> => {
  const params = GetTableParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  if (table.status !== "Active") { res.status(409).json({ error: "This table is currently unavailable." }); return; }

  const [updated] = await db.update(tablesTable).set({ occupancyStatus: "occupied" }).where(eq(tablesTable.id, params.data.id)).returning();
  res.json(GetTableResponse.parse({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() }));
});

router.patch("/tables/:id", async (req, res): Promise<void> => {
  const params = UpdateTableParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const payload = { ...parsed.data };
  if (payload.status && payload.status !== "Active") {
    payload.currentOrderId = null;
    payload.occupancyStatus = payload.occupancyStatus ?? "dirty";
  }

  const [table] = await db.update(tablesTable).set(payload).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(UpdateTableResponse.parse({ ...table, createdAt: table.createdAt.toISOString(), updatedAt: table.updatedAt.toISOString() }));
});

router.delete("/tables/:id", async (req, res): Promise<void> => {
  const params = DeleteTableParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [table] = await db.delete(tablesTable).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.sendStatus(204);
});

export default router;
