import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tableSeatSessionsTable = pgTable("table_seat_sessions", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull(),
  slotCode: text("slot_code").notNull(), // S1, S2, ...
  groupName: text("group_name"),
  status: text("status").notNull().default("active"), // active, payment_pending, paid, cleaning, closed
  currentOrderId: integer("current_order_id"),
  notes: text("notes"),
  autoManaged: boolean("auto_managed").notNull().default(true),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTableSeatSessionSchema = createInsertSchema(tableSeatSessionsTable).omit({
  id: true,
  openedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTableSeatSession = z.infer<typeof insertTableSeatSessionSchema>;
export type TableSeatSession = typeof tableSeatSessionsTable.$inferSelect;
