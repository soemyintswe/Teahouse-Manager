import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tablesTable = pgTable("tables", {
  id: serial("id").primaryKey(),
  tableNumber: text("table_number").notNull(),
  zone: text("zone").notNull().default("hall"), // hall or aircon
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("available"), // available, occupied, payment_pending, dirty
  qrCode: text("qr_code"),
  posX: integer("pos_x").notNull().default(0),
  posY: integer("pos_y").notNull().default(0),
  currentOrderId: integer("current_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTableSchema = createInsertSchema(tablesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tablesTable.$inferSelect;
