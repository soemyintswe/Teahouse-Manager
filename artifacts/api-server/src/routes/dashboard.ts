import { Router, type IRouter } from "express";
import { sql, eq, gte } from "drizzle-orm";
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

  // Today's payments
  const todayPayments = await db.select().from(paymentsTable).where(
    sql`${paymentsTable.createdAt} >= ${today.toISOString()} AND ${paymentsTable.status} = 'completed'`
  );
  const todaySales = todayPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
  const todayOrders = todayPayments.length;

  // Month sales
  const monthPayments = await db.select().from(paymentsTable).where(
    sql`${paymentsTable.createdAt} >= ${startOfMonth.toISOString()} AND ${paymentsTable.status} = 'completed'`
  );
  const monthSales = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  // Active orders (open status)
  const activeOrders = await db.select().from(ordersTable).where(eq(ordersTable.status, "open"));

  // Table statuses
  const tables = await db.select().from(tablesTable);
  const availableTables = tables.filter(t => t.status === "available").length;
  const occupiedTables = tables.filter(t => t.status === "occupied").length;
  const pendingPaymentTables = tables.filter(t => t.status === "payment_pending").length;

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

    const dayPayments = await db.select().from(paymentsTable).where(
      sql`${paymentsTable.createdAt} >= ${day.toISOString()} AND ${paymentsTable.createdAt} < ${nextDay.toISOString()} AND ${paymentsTable.status} = 'completed'`
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
