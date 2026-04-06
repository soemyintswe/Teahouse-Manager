import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, tablesTable } from "@workspace/db";
import {
  ListKitchenOrdersResponse,
  UpdateKitchenItemStatusParams,
  UpdateKitchenItemStatusBody,
  UpdateKitchenItemStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/kitchen/orders", async (_req, res): Promise<void> => {
  // Get open orders that have items not yet served
  const activeOrders = await db.select().from(ordersTable).where(
    inArray(ordersTable.status, ["open", "ready_to_pay"])
  );

  const result = [];
  for (const order of activeOrders) {
    const items = await db.select().from(orderItemsTable).where(
      inArray(orderItemsTable.kitchenStatus, ["new", "cooking", "ready"])
    ).then(rows => rows.filter(r => r.orderId === order.id));

    if (items.length === 0) continue;

    const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, order.tableId));
    result.push({
      orderId: order.id,
      tableNumber: order.tableNumber,
      zone: table?.zone ?? "hall",
      orderTime: order.createdAt.toISOString(),
      items: items.map(item => ({
        ...item,
        unitPrice: item.unitPrice.toString(),
        createdAt: item.createdAt.toISOString(),
      })),
    });
  }

  res.json(ListKitchenOrdersResponse.parse(result));
});

router.patch("/kitchen/items/:itemId/status", async (req, res): Promise<void> => {
  const params = UpdateKitchenItemStatusParams.safeParse({
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateKitchenItemStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [item] = await db.update(orderItemsTable).set({ kitchenStatus: parsed.data.kitchenStatus }).where(
    eq(orderItemsTable.id, params.data.itemId)
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }

  res.json(UpdateKitchenItemStatusResponse.parse({ ...item, unitPrice: item.unitPrice.toString(), createdAt: item.createdAt.toISOString() }));
});

export default router;
