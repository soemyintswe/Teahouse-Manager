import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull(), // kg, liter, piece, bag, etc.
  currentStock: numeric("current_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  minimumStock: numeric("minimum_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  cost: numeric("cost", { precision: 10, scale: 2 }).notNull().default("0"),
  supplierId: integer("supplier_id"),
  lastRestockedAt: timestamp("last_restocked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
