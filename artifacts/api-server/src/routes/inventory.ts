import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, inventoryTable } from "@workspace/db";
import { requireRoles } from "../lib/auth";
import {
  ListInventoryResponse,
  CreateInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
  UpdateInventoryItemResponse,
  DeleteInventoryItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const INVENTORY_VIEW_ROLES = ["waiter", "kitchen", "cashier", "supervisor", "manager", "owner"] as const;
const INVENTORY_MANAGE_ROLES = ["supervisor", "manager", "owner"] as const;

function formatItem(item: typeof inventoryTable.$inferSelect) {
  return {
    ...item,
    currentStock: item.currentStock.toString(),
    minimumStock: item.minimumStock.toString(),
    cost: item.cost.toString(),
    lastRestockedAt: item.lastRestockedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

router.get("/inventory", requireRoles(INVENTORY_VIEW_ROLES), async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryTable).orderBy(inventoryTable.name);
  res.json(ListInventoryResponse.parse(items.map(formatItem)));
});

router.post("/inventory", requireRoles(INVENTORY_MANAGE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.insert(inventoryTable).values(parsed.data).returning();
  res.status(201).json(formatItem(item));
});

router.patch("/inventory/:id", requireRoles(INVENTORY_MANAGE_ROLES), async (req, res): Promise<void> => {
  const params = UpdateInventoryItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.update(inventoryTable).set(parsed.data).where(eq(inventoryTable.id, params.data.id)).returning();
  if (!item) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.json(UpdateInventoryItemResponse.parse(formatItem(item)));
});

router.delete("/inventory/:id", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  const params = DeleteInventoryItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(inventoryTable).where(eq(inventoryTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
