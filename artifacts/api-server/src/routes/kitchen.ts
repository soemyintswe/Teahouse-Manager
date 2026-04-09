import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, menuItemsTable, tablesTable, settingsTable } from "@workspace/db";
import { requireRoles } from "../lib/auth";
import {
  ListKitchenOrdersQueryParams,
  ListKitchenOrdersResponse,
  UpdateKitchenItemStatusParams,
  UpdateKitchenItemStatusBody,
  UpdateKitchenItemStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const KITCHEN_ROLES = ["kitchen", "supervisor", "manager", "owner"] as const;

function isBillableOrderItem(item: typeof orderItemsTable.$inferSelect): boolean {
  return (item.kitchenStatus ?? "").trim().toLowerCase() !== "cancelled";
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

  await executor
    .update(ordersTable)
    .set({
      subtotal: subtotal.toFixed(2),
      airconFee: airconFee.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
    })
    .where(eq(ordersTable.id, orderId));
}

async function syncOrderAfterKitchenCancel(orderId: number, executor: any = db): Promise<void> {
  const [order] = await executor.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order || order.status === "paid") return;

  await recalcOrder(orderId, executor);

  const items = await executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const hasBillableItems = items.some(isBillableOrderItem);

  if (!hasBillableItems) {
    await executor.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, orderId));
    await executor
      .update(tablesTable)
      .set({ occupancyStatus: "available", currentOrderId: null })
      .where(eq(tablesTable.id, order.tableId));
  }
}

router.get("/kitchen/orders", requireRoles(KITCHEN_ROLES), async (req, res): Promise<void> => {
  const query = ListKitchenOrdersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  // Get open orders that have items not yet served
  const activeOrders = await db
    .select({
      id: ordersTable.id,
      tableId: ordersTable.tableId,
      tableNumber: ordersTable.tableNumber,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .innerJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(and(inArray(ordersTable.status, ["open", "ready_to_pay"]), eq(tablesTable.status, "Active")));

  if (activeOrders.length === 0) {
    res.json(ListKitchenOrdersResponse.parse([]));
    return;
  }

  const activeOrderIds = activeOrders.map((order) => order.id);
  const condition = query.data.station
    ? and(
        inArray(orderItemsTable.orderId, activeOrderIds),
        inArray(orderItemsTable.kitchenStatus, ["new", "cooking", "ready"]),
        eq(menuItemsTable.station, query.data.station),
      )
    : and(
        inArray(orderItemsTable.orderId, activeOrderIds),
        inArray(orderItemsTable.kitchenStatus, ["new", "cooking", "ready"]),
      );

  const kitchenItems = await db.select({
    item: orderItemsTable,
  }).from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(condition);

  if (kitchenItems.length === 0) {
    res.json(ListKitchenOrdersResponse.parse([]));
    return;
  }

  const tableIds = [...new Set(activeOrders.map((order) => order.tableId))];
  const tableRows = await db
    .select({ id: tablesTable.id, zone: tablesTable.zone })
    .from(tablesTable)
    .where(inArray(tablesTable.id, tableIds));
  const zoneByTableId = new Map(tableRows.map((table) => [table.id, table.zone]));

  const itemsByOrderId = new Map<number, Array<(typeof kitchenItems)[number]["item"]>>();
  for (const row of kitchenItems) {
    const existing = itemsByOrderId.get(row.item.orderId);
    if (existing) existing.push(row.item);
    else itemsByOrderId.set(row.item.orderId, [row.item]);
  }

  const result = activeOrders.flatMap((order) => {
    const items = itemsByOrderId.get(order.id);
    if (!items || items.length === 0) return [];

    return [{
      orderId: order.id,
      tableNumber: order.tableNumber,
      zone: zoneByTableId.get(order.tableId) ?? "hall",
      orderTime: order.createdAt.toISOString(),
      items: items.map(item => ({
        ...item,
        unitPrice: item.unitPrice.toString(),
        createdAt: item.createdAt.toISOString(),
      })),
    }];
  });

  res.json(ListKitchenOrdersResponse.parse(result));
});

router.patch("/kitchen/items/:itemId/status", requireRoles(KITCHEN_ROLES), async (req, res): Promise<void> => {
  const params = UpdateKitchenItemStatusParams.safeParse({
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateKitchenItemStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const reason = typeof (req.body as { reason?: unknown })?.reason === "string"
    ? (req.body as { reason: string }).reason.trim()
    : "";

  const [existing] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, params.data.itemId));
  if (!existing) { res.status(404).json({ error: "Order item not found" }); return; }

  const nextStatusRaw = parsed.data.kitchenStatus?.trim().toLowerCase();
  const nextStatus = nextStatusRaw || existing.kitchenStatus;
  const payload: Partial<typeof orderItemsTable.$inferInsert> = {
    kitchenStatus: nextStatus,
  };

  if (nextStatus === "cancelled") {
    payload.notes = reason ? `[Kitchen Cancelled] ${reason}` : (existing.notes ?? "[Kitchen Cancelled]");
  }

  const [item] = await db.update(orderItemsTable).set(payload).where(
    eq(orderItemsTable.id, params.data.itemId)
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }

  if (nextStatus === "cancelled") {
    await syncOrderAfterKitchenCancel(item.orderId);
  }

  res.json(UpdateKitchenItemStatusResponse.parse({ ...item, unitPrice: item.unitPrice.toString(), createdAt: item.createdAt.toISOString() }));
});

export default router;
