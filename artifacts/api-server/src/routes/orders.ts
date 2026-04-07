import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, menuItemsTable, tablesTable, settingsTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  ListOrdersResponse,
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderParams,
  UpdateOrderBody,
  UpdateOrderResponse,
  AddOrderItemParams,
  AddOrderItemBody,
  UpdateOrderItemParams,
  UpdateOrderItemBody,
  UpdateOrderItemResponse,
  RemoveOrderItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatOrder(order: typeof ordersTable.$inferSelect) {
  return {
    ...order,
    subtotal: order.subtotal.toString(),
    airconFee: order.airconFee.toString(),
    taxAmount: order.taxAmount.toString(),
    totalAmount: order.totalAmount.toString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function formatOrderItem(item: typeof orderItemsTable.$inferSelect) {
  return {
    ...item,
    unitPrice: item.unitPrice.toString(),
    createdAt: item.createdAt.toISOString(),
  };
}

async function recalcOrder(orderId: number, executor: any = db): Promise<void> {
  const items = await executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const [order] = await executor.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return;

  const [settings] = await executor.select().from(settingsTable).limit(1);
  const taxRate = settings ? parseFloat(settings.taxRate.toString()) / 100 : 0.05;
  const airconFeeBase = settings ? parseFloat(settings.airconFee.toString()) : 500;

  const subtotal = items.reduce(
    (sum: number, item: typeof orderItemsTable.$inferSelect) =>
      sum + parseFloat(item.unitPrice.toString()) * item.quantity,
    0,
  );
  const [table] = await executor.select().from(tablesTable).where(eq(tablesTable.id, order.tableId));
  const airconFee = (table?.zone === "aircon") ? airconFeeBase : 0;
  const taxAmount = (subtotal + airconFee) * taxRate;
  const totalAmount = subtotal + airconFee + taxAmount;

  await executor.update(ordersTable).set({
    subtotal: subtotal.toFixed(2),
    airconFee: airconFee.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  }).where(eq(ordersTable.id, orderId));
}

router.get("/orders", async (req, res): Promise<void> => {
  const qp = ListOrdersQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (qp.success && qp.data.status) conditions.push(eq(ordersTable.status, qp.data.status));
  if (qp.success && qp.data.tableId != null) conditions.push(eq(ordersTable.tableId, qp.data.tableId));
  if (qp.success && qp.data.date) {
    conditions.push(sql`DATE(${ordersTable.createdAt}) = ${qp.data.date}`);
  }

  let orders;
  if (conditions.length > 0) {
    orders = await db.select().from(ordersTable).where(and(...conditions)).orderBy(sql`${ordersTable.createdAt} desc`);
  } else {
    orders = await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} desc`);
  }
  res.json(ListOrdersResponse.parse(orders.map(formatOrder)));
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const createdOrderId = await db.transaction(async (tx) => {
      const [table] = await tx.select().from(tablesTable).where(eq(tablesTable.id, parsed.data.tableId));
      if (!table) {
        const error = new Error("Table not found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      if (table.status !== "Active") {
        const error = new Error("This table is currently unavailable.") as Error & { statusCode?: number };
        error.statusCode = 409;
        throw error;
      }

      if (table.currentOrderId) {
        const [activeOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.id, table.currentOrderId));
        if (activeOrder && (activeOrder.status === "open" || activeOrder.status === "ready_to_pay")) {
          const error = new Error(`Table already has active order #${activeOrder.id}`) as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }
      }

      const [order] = await tx.insert(ordersTable).values({
        tableId: parsed.data.tableId,
        tableNumber: table.tableNumber,
        notes: parsed.data.notes ?? null,
        staffId: parsed.data.staffId ?? null,
      }).returning();

      await tx.update(tablesTable)
        .set({ occupancyStatus: "occupied", currentOrderId: order.id })
        .where(eq(tablesTable.id, parsed.data.tableId));

      if (parsed.data.items && parsed.data.items.length > 0) {
        for (const item of parsed.data.items) {
          const [menuItem] = await tx.select().from(menuItemsTable).where(eq(menuItemsTable.id, item.menuItemId));
          if (menuItem) {
            await tx.insert(orderItemsTable).values({
              orderId: order.id,
              menuItemId: item.menuItemId,
              menuItemName: menuItem.name,
              quantity: item.quantity,
              unitPrice: menuItem.price,
              customizations: item.customizations ?? null,
              notes: item.notes ?? null,
            });
          }
        }
        await recalcOrder(order.id, tx);
      }

      return order.id;
    });

    const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, createdOrderId));
    if (!updatedOrder) {
      res.status(500).json({ error: "Failed to load created order" });
      return;
    }

    res.status(201).json(formatOrder(updatedOrder));
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 500;
    const message = error instanceof Error ? error.message : "Failed to create order";
    res.status(statusCode).json({ error: message });
  }
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  res.json(GetOrderResponse.parse({
    ...formatOrder(order),
    items: items.map(formatOrderItem),
  }));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // If paid/cancelled, free the table
  if (parsed.data.status === "paid" || parsed.data.status === "cancelled") {
    await db.update(tablesTable).set({ occupancyStatus: "dirty", currentOrderId: null }).where(eq(tablesTable.currentOrderId, order.id));
  }
  if (parsed.data.status === "ready_to_pay") {
    await db.update(tablesTable).set({ occupancyStatus: "payment_pending" }).where(eq(tablesTable.currentOrderId, order.id));
  }
  if (parsed.data.status === "open") {
    await db.update(tablesTable).set({ occupancyStatus: "occupied" }).where(eq(tablesTable.currentOrderId, order.id));
  }

  res.json(UpdateOrderResponse.parse(formatOrder(order)));
});

router.post("/orders/:id/items", async (req, res): Promise<void> => {
  const params = AddOrderItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [menuItem] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, parsed.data.menuItemId));
  if (!menuItem) { res.status(404).json({ error: "Menu item not found" }); return; }

  const [item] = await db.insert(orderItemsTable).values({
    orderId: params.data.id,
    menuItemId: parsed.data.menuItemId,
    menuItemName: menuItem.name,
    quantity: parsed.data.quantity,
    unitPrice: menuItem.price,
    customizations: parsed.data.customizations ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();

  await recalcOrder(params.data.id);

  res.status(201).json(formatOrderItem(item));
});

router.patch("/orders/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = UpdateOrderItemParams.safeParse({
    id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10),
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [item] = await db.update(orderItemsTable).set(parsed.data).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }

  if (parsed.data.quantity != null) {
    await recalcOrder(params.data.id);
  }

  res.json(UpdateOrderItemResponse.parse(formatOrderItem(item)));
});

router.delete("/orders/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = RemoveOrderItemParams.safeParse({
    id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10),
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [item] = await db.delete(orderItemsTable).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }
  await recalcOrder(params.data.id);
  res.sendStatus(204);
});

export default router;
