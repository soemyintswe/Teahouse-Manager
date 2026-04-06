import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  restaurantName: text("restaurant_name").notNull().default("Min Khaung Tea House & Restaurant"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  airconFee: numeric("aircon_fee", { precision: 10, scale: 2 }).notNull().default("500.00"),
  currency: text("currency").notNull().default("MMK"),
  receiptFooter: text("receipt_footer"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
