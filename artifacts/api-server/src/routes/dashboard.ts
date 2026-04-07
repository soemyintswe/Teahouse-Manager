import { Router, type IRouter } from "express";
import { sql, eq, and } from "drizzle-orm";
import { db, ordersTable, tablesTable, inventoryTable, orderItemsTable, paymentsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetSalesChartResponse,
  GetTopItemsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Today's revenue from completed payments.
  // Maintenance tables are excluded from live billing unless the order has a confirmed paid status.
  const todayPayments = await db
    .select({
      amount: paymentsTable.amount,
    })
    .from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .innerJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(
      and(
        sql`${paymentsTable.createdAt} >= ${today.toISOString()}`,
        eq(paymentsTable.status, "completed"),
        sql`(${tablesTable.status} <> 'Maintenance' OR ${ordersTable.status} = 'paid')`,
      ),
    );
  const todaySales = todayPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
  const todayOrders = todayPayments.length;

  // Month sales
  const monthPayments = await db
    .select({
      amount: paymentsTable.amount,
    })
    .from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .innerJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(
      and(
        sql`${paymentsTable.createdAt} >= ${startOfMonth.toISOString()}`,
        eq(paymentsTable.status, "completed"),
        sql`(${tablesTable.status} <> 'Maintenance' OR ${ordersTable.status} = 'paid')`,
      ),
    );
  const monthSales = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  // Active orders (open status) on active tables only
  const activeOrders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .innerJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(and(eq(ordersTable.status, "open"), eq(tablesTable.status, "Active")));

  // Table occupancy in active service
  const tables = await db.select().from(tablesTable);
  const activeServiceTables = tables.filter(t => t.status === "Active");
  const availableTables = activeServiceTables.filter(t => t.occupancyStatus === "available").length;
  const occupiedTables = activeServiceTables.filter(t => t.occupancyStatus === "occupied" || t.occupancyStatus === "paid").length;
  const pendingPaymentTables = activeServiceTables.filter(t => t.occupancyStatus === "payment_pending").length;

  // Low stock
  const allInventory = await db.select().from(inventoryTable);
  const lowStockItems = allInventory.filter(i =>
    parseFloat(i.currentStock.toString()) <= parseFloat(i.minimumStock.toString())
  ).length;

  res.json(GetDashboardSummaryResponse.parse({
    todaySales: todaySales.toFixed(2),
    todayOrders,
    activeOrders: activeOrders.length,
    availableTables,
    occupiedTables,
    pendingPaymentTables,
    lowStockItems,
    monthSales: monthSales.toFixed(2),
  }));
});

router.get("/dashboard/sales-chart", async (_req, res): Promise<void> => {
  const result = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayPayments = await db
      .select({
        amount: paymentsTable.amount,
      })
      .from(paymentsTable)
      .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
      .innerJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
      .where(
        and(
          sql`${paymentsTable.createdAt} >= ${day.toISOString()}`,
          sql`${paymentsTable.createdAt} < ${nextDay.toISOString()}`,
          eq(paymentsTable.status, "completed"),
          sql`(${tablesTable.status} <> 'Maintenance' OR ${ordersTable.status} = 'paid')`,
        ),
      );

    const sales = dayPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

    result.push({
      date: day.toISOString().split('T')[0],
      sales: sales.toFixed(2),
      orders: dayPayments.length,
    });
  }

  res.json(GetSalesChartResponse.parse(result));
});

router.get("/dashboard/top-items", async (_req, res): Promise<void> => {
  const items = await db.select({
    menuItemId: orderItemsTable.menuItemId,
    name: orderItemsTable.menuItemName,
    totalSold: sql<number>`sum(${orderItemsTable.quantity})::integer`,
    totalRevenue: sql<string>`sum(${orderItemsTable.unitPrice} * ${orderItemsTable.quantity})::text`,
  }).from(orderItemsTable)
    .groupBy(orderItemsTable.menuItemId, orderItemsTable.menuItemName)
    .orderBy(sql`sum(${orderItemsTable.quantity}) desc`)
    .limit(10);

  res.json(GetTopItemsResponse.parse(items.map(i => ({
    menuItemId: i.menuItemId,
    name: i.name,
    totalSold: Number(i.totalSold) || 0,
    totalRevenue: (parseFloat(i.totalRevenue || '0')).toFixed(2),
  }))));
});

export default router;
