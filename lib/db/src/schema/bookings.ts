import { boolean, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tableBookingsTable = pgTable("table_bookings", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull(),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  slotStartAt: timestamp("slot_start_at", { withTimezone: true }).notNull(),
  slotEndAt: timestamp("slot_end_at", { withTimezone: true }).notNull(),
  extensionMinutes: integer("extension_minutes").notNull().default(0),
  bookingFee: numeric("booking_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  preorderAmount: numeric("preorder_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  bookingFeePaid: boolean("booking_fee_paid").notNull().default(false),
  preorderAmountPaid: boolean("preorder_amount_paid").notNull().default(false),
  status: text("status").notNull().default("pending_payment"), // pending_payment, confirmed, checked_in, cancelled, completed
  autoCancelAt: timestamp("auto_cancel_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  checkInAt: timestamp("check_in_at", { withTimezone: true }),
  orderAt: timestamp("order_at", { withTimezone: true }),
  checkOutAt: timestamp("check_out_at", { withTimezone: true }),
  orderId: integer("order_id"),
  cancelReason: text("cancel_reason"),
  notes: text("notes"),
  createdByStaffId: integer("created_by_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTableBookingSchema = createInsertSchema(tableBookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTableBooking = z.infer<typeof insertTableBookingSchema>;
export type TableBooking = typeof tableBookingsTable.$inferSelect;
