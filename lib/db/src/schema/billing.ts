import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tableMergeGroupsTable = pgTable("table_merge_groups", {
  id: serial("id").primaryKey(),
  zone: text("zone").notNull(),
  anchorTableId: integer("anchor_table_id").notNull(),
  mergedTableIds: text("merged_table_ids").notNull(), // JSON array of table ids
  status: text("status").notNull().default("active"), // active, released
  createdByStaffId: integer("created_by_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const billingAuditLogsTable = pgTable("billing_audit_logs", {
  id: serial("id").primaryKey(),
  operation: text("operation").notNull(), // merge_tables, release_merge, split_bill
  mergeGroupId: integer("merge_group_id"),
  orderId: integer("order_id"),
  tableIds: text("table_ids"), // JSON array
  detail: text("detail"), // JSON object
  staffId: integer("staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTableMergeGroupSchema = createInsertSchema(tableMergeGroupsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTableMergeGroup = z.infer<typeof insertTableMergeGroupSchema>;
export type TableMergeGroup = typeof tableMergeGroupsTable.$inferSelect;

export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBillingAuditLog = z.infer<typeof insertBillingAuditLogSchema>;
export type BillingAuditLog = typeof billingAuditLogsTable.$inferSelect;
