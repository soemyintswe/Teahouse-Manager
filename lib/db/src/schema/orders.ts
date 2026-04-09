import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull(),
  tableNumber: text("table_number").notNull(),
  orderSource: text("order_source").notNull().default("dine_in"), // dine_in, delivery
  status: text("status").notNull().default("open"), // open, ready_to_pay, paid, cancelled
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  airconFee: numeric("aircon_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  customerPhones: text("customer_phones"), // JSON array string
  deliveryUnitNo: text("delivery_unit_no"),
  deliveryStreet: text("delivery_street"),
  deliveryWard: text("delivery_ward"),
  deliveryTownship: text("delivery_township"),
  deliveryRegion: text("delivery_region"),
  deliveryMapLink: text("delivery_map_link"),
  deliveryStatus: text("delivery_status"), // received, preparing, out_for_delivery, delivered, cancelled
  notes: text("notes"),
  staffId: integer("staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  menuItemId: integer("menu_item_id").notNull(),
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  customizations: text("customizations"),
  kitchenStatus: text("kitchen_status").notNull().default("new"), // new, cooking, ready, served
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
