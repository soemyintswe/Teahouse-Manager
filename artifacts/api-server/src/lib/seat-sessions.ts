import { and, eq, inArray } from "drizzle-orm";
import { db, tableSeatSessionsTable, tablesTable } from "@workspace/db";

const ACTIVE_STATUSES = ["active", "payment_pending", "paid", "cleaning"] as const;

type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

function resolveTableOccupancyStatus(statuses: ActiveStatus[]): "available" | "occupied" | "payment_pending" | "paid" | "dirty" {
  if (statuses.includes("active")) return "occupied";
  if (statuses.includes("payment_pending")) return "payment_pending";
  if (statuses.includes("paid")) return "paid";
  if (statuses.includes("cleaning")) return "dirty";
  return "available";
}

export async function syncTableOccupancyFromSeatSessions(tableId: number, executor: any = db): Promise<void> {
  const sessions = (await executor
    .select()
    .from(tableSeatSessionsTable)
    .where(and(
      eq(tableSeatSessionsTable.tableId, tableId),
      inArray(tableSeatSessionsTable.status, ACTIVE_STATUSES as unknown as string[]),
    ))) as Array<typeof tableSeatSessionsTable.$inferSelect>;

  const statuses = sessions
    .map((session) => session.status)
    .filter((status): status is ActiveStatus => (ACTIVE_STATUSES as readonly string[]).includes(status));
  const occupancyStatus = resolveTableOccupancyStatus(statuses);

  const latestSessionWithOrder = [...sessions]
    .filter((session) => session.currentOrderId != null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  await executor
    .update(tablesTable)
    .set({
      occupancyStatus,
      currentOrderId: occupancyStatus === "available" ? null : latestSessionWithOrder?.currentOrderId ?? null,
    })
    .where(eq(tablesTable.id, tableId));
}
