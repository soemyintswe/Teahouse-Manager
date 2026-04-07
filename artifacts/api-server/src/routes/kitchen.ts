import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, menuItemsTable, tablesTable } from "@workspace/db";
import {
  ListKitchenOrdersQueryParams,
  ListKitchenOrdersResponse,
  UpdateKitchenItemStatusParams,
  UpdateKitchenItemStatusBody,
  UpdateKitchenItemStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/kitchen/orders", async (req, res): Promise<void> => {
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
