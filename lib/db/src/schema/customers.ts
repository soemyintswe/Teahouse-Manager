import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  password: text("password").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, denied, terminated
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const customerPhonesTable = pgTable("customer_phones", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  phone: text("phone").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerAddressesTable = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  unitNo: text("unit_no"),
  street: text("street").notNull(),
  ward: text("ward"),
  township: text("township").notNull(),
  region: text("region").notNull(),
  mapLink: text("map_link"),
  isDefault: boolean("is_default").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;

export const insertCustomerPhoneSchema = createInsertSchema(customerPhonesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerPhone = z.infer<typeof insertCustomerPhoneSchema>;
export type CustomerPhone = typeof customerPhonesTable.$inferSelect;

export const insertCustomerAddressSchema = createInsertSchema(customerAddressesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomerAddress = z.infer<typeof insertCustomerAddressSchema>;
export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
