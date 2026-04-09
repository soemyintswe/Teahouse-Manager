import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, menuItemsTable, tablesTable, settingsTable } from "@workspace/db";
import { canAccessTable, requireAuth } from "../lib/auth";
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
const MODIFIABLE_ORDER_STATUSES = ["open", "ready_to_pay"] as const;

function isBillableOrderItem(item: typeof orderItemsTable.$inferSelect): boolean {
  return (item.kitchenStatus ?? "").trim().toLowerCase() !== "cancelled";
}

function isOrderModifiable(status: string): boolean {
  return MODIFIABLE_ORDER_STATUSES.includes(status as (typeof MODIFIABLE_ORDER_STATUSES)[number]);
}

function normalizeCancelNote(reason: string, actor: string): string {
  const trimmedReason = reason.trim();
  const trimmedActor = actor.trim() || "staff";
  if (!trimmedReason) return `[Cancelled by ${trimmedActor}]`;
  return `[Cancelled by ${trimmedActor}] ${trimmedReason}`;
}

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

  const subtotal = items
    .filter(isBillableOrderItem)
    .reduce(
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

async function syncOrderAfterItemChange(orderId: number, executor: any = db): Promise<void> {
  const [order] = await executor.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return;

  await recalcOrder(orderId, executor);

  if (order.status === "paid") return;

  const items = await executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const hasBillableItems = items.some(isBillableOrderItem);

  if (!hasBillableItems) {
    await executor
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, orderId));

    await executor
      .update(tablesTable)
      .set({ occupancyStatus: "available", currentOrderId: null })
      .where(eq(tablesTable.id, order.tableId));
  }
}

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const qp = ListOrdersQueryParams.safeParse(req.query);
  if (req.auth?.role === "guest") {
    const requestedTableId = qp.success ? qp.data.tableId : undefined;
    if (requestedTableId == null || !canAccessTable(req, requestedTableId)) {
      res.status(403).json({ error: "Permission denied." });
      return;
    }
  }

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

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, parsed.data.tableId)) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }

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

      if (["payment_pending", "paid", "dirty"].includes(table.occupancyStatus)) {
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

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  res.json(GetOrderResponse.parse({
    ...formatOrder(order),
    items: items.map(formatOrderItem),
  }));
});

router.patch("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [targetOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!targetOrder) { res.status(404).json({ error: "Order not found" }); return; }
  if (req.auth?.role === "guest") {
    if (!canAccessTable(req, targetOrder.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
    const nextStatus = parsed.data.status;
    if (nextStatus && nextStatus !== "ready_to_pay") {
      res.status(403).json({ error: "Guest can only request bill/payment." });
      return;
    }
  }

  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // Paid table should stay occupied until manual checkout.
  if (parsed.data.status === "paid") {
    await db
      .update(tablesTable)
      .set({ occupancyStatus: "paid", currentOrderId: order.id })
      .where(eq(tablesTable.id, order.tableId));
  }

  // Cancelled order can free table immediately.
  if (parsed.data.status === "cancelled") {
    await db
      .update(tablesTable)
      .set({ occupancyStatus: "available", currentOrderId: null })
      .where(eq(tablesTable.id, order.tableId));
  }
  if (parsed.data.status === "ready_to_pay") {
    await db.update(tablesTable).set({ occupancyStatus: "payment_pending" }).where(eq(tablesTable.id, order.tableId));
  }
  if (parsed.data.status === "open") {
    await db.update(tablesTable).set({ occupancyStatus: "occupied", currentOrderId: order.id }).where(eq(tablesTable.id, order.tableId));
  }

  res.json(UpdateOrderResponse.parse(formatOrder(order)));
});

router.post("/orders/:id/items", requireAuth, async (req, res): Promise<void> => {
  const params = AddOrderItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isOrderModifiable(order.status)) { res.status(409).json({ error: "This order can no longer be modified." }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
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

router.patch("/orders/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateOrderItemParams.safeParse({
    id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10),
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isOrderModifiable(order.status)) { res.status(409).json({ error: "This order can no longer be modified." }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  const [existingItem] = await db.select().from(orderItemsTable).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  );
  if (!existingItem) { res.status(404).json({ error: "Order item not found" }); return; }

  const payload = { ...parsed.data };
  if (typeof payload.kitchenStatus === "string" && payload.kitchenStatus.trim().toLowerCase() === "cancelled") {
    const actor = req.auth?.role === "guest" ? "customer" : req.auth?.role ?? "staff";
    payload.kitchenStatus = "cancelled";
    payload.notes = normalizeCancelNote(payload.notes ?? existingItem.notes ?? "", actor);
  }

  const [item] = await db.update(orderItemsTable).set(payload).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }

  if (payload.quantity != null || payload.kitchenStatus != null) {
    await syncOrderAfterItemChange(params.data.id);
  }

  res.json(UpdateOrderItemResponse.parse(formatOrderItem(item)));
});

router.delete("/orders/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const params = RemoveOrderItemParams.safeParse({
    id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10),
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isOrderModifiable(order.status)) { res.status(409).json({ error: "This order can no longer be modified." }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  const [item] = await db.delete(orderItemsTable).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }
  await syncOrderAfterItemChange(params.data.id);
  res.sendStatus(204);
});

export default router;
