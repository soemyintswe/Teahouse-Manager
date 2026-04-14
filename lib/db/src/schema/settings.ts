import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  restaurantName: text("restaurant_name").notNull().default("Min Khaung Tea House & Restaurant"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  airconFee: numeric("aircon_fee", { precision: 10, scale: 2 }).notNull().default("500.00"),
  currency: text("currency").notNull().default("MMK"),
  receiptFooter: text("receipt_footer"),
  bookingLeadTimeMinutes: integer("booking_lead_time_minutes").notNull().default(60),
  bookingNoShowGraceMinutes: integer("booking_no_show_grace_minutes").notNull().default(15),
  bookingDefaultSlotMinutes: integer("booking_default_slot_minutes").notNull().default(120),
  businessOpenTime: text("business_open_time").notNull().default("08:00"),
  businessCloseTime: text("business_close_time").notNull().default("22:00"),
  businessClosedWeekdays: text("business_closed_weekdays").notNull().default("[]"), // JSON array of 0-6
  businessClosedDates: text("business_closed_dates").notNull().default("[]"), // JSON array of YYYY-MM-DD
  notifyActivateEmailSubject: text("notify_activate_email_subject")
    .notNull()
    .default("Teahouse Manager - Account Activated"),
  notifyActivateEmailBody: text("notify_activate_email_body")
    .notNull()
    .default(
      [
        "Hello {{fullName}},",
        "",
        "Your Teahouse Manager account has been activated.",
        "Temporary Password: {{temporaryPassword}}",
        "",
        "Please login and change this password immediately.",
        "If you did not request this change, contact support.",
      ].join("\n"),
    ),
  notifyActivateSmsBody: text("notify_activate_sms_body")
    .notNull()
    .default(
      "Teahouse Manager account activated. Temp password: {{temporaryPassword}}. Please login and change it now.",
    ),
  notifyResetEmailSubject: text("notify_reset_email_subject")
    .notNull()
    .default("Teahouse Manager - Password Reset"),
  notifyResetEmailBody: text("notify_reset_email_body")
    .notNull()
    .default(
      [
        "Hello {{fullName}},",
        "",
        "Your Teahouse Manager password has been reset.",
        "Temporary Password: {{temporaryPassword}}",
        "",
        "Please login and change this password immediately.",
        "If you did not request this change, contact support.",
      ].join("\n"),
    ),
  notifyResetSmsBody: text("notify_reset_sms_body")
    .notNull()
    .default(
      "Teahouse Manager password reset. Temp password: {{temporaryPassword}}. Please login and change it now.",
    ),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const notificationLogsTable = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  reason: text("reason").notNull(), // account_activated, password_reset
  channel: text("channel").notNull(), // email, sms
  provider: text("provider").notNull(),
  recipient: text("recipient"),
  status: text("status").notNull(), // sent, failed, skipped
  message: text("message"),
  payload: text("payload"), // serialized template metadata
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;

export const insertNotificationLogSchema = createInsertSchema(notificationLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLogsTable.$inferSelect;
