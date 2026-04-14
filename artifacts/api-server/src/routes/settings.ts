import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, notificationLogsTable, settingsTable } from "@workspace/db";
import { requireRoles } from "../lib/auth";

const router: IRouter = Router();

const DEFAULT_NOTIFICATION_TEMPLATES = {
  notifyActivateEmailSubject: "Teahouse Manager - Account Activated",
  notifyActivateEmailBody: [
    "Hello {{fullName}},",
    "",
    "Your Teahouse Manager account has been activated.",
    "Temporary Password: {{temporaryPassword}}",
    "",
    "Please login and change this password immediately.",
    "If you did not request this change, contact support.",
  ].join("\n"),
  notifyActivateSmsBody:
    "Teahouse Manager account activated. Temp password: {{temporaryPassword}}. Please login and change it now.",
  notifyResetEmailSubject: "Teahouse Manager - Password Reset",
  notifyResetEmailBody: [
    "Hello {{fullName}},",
    "",
    "Your Teahouse Manager password has been reset.",
    "Temporary Password: {{temporaryPassword}}",
    "",
    "Please login and change this password immediately.",
    "If you did not request this change, contact support.",
  ].join("\n"),
  notifyResetSmsBody:
    "Teahouse Manager password reset. Temp password: {{temporaryPassword}}. Please login and change it now.",
} as const;

type SettingsPatchPayload = Partial<{
  restaurantName: string;
  taxRate: string;
  airconFee: string;
  currency: string;
  receiptFooter: string | null;
  notifyActivateEmailSubject: string;
  notifyActivateEmailBody: string;
  notifyActivateSmsBody: string;
  notifyResetEmailSubject: string;
  notifyResetEmailBody: string;
  notifyResetSmsBody: string;
}>;

type NotificationLogsQueryPayload = {
  reason?: "account_activated" | "password_reset";
  channel?: "email" | "sms";
  status?: "sent" | "failed" | "skipped";
  startDate?: string;
  endDate?: string;
  limit?: number;
};

type NotificationLogResponseItem = {
  id: number;
  customerId: number | null;
  customerName: string | null;
  reason: string;
  channel: string;
  provider: string;
  recipient: string | null;
  status: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
};

type BusinessHoursSettingsResponse = {
  bookingLeadTimeMinutes: number;
  bookingNoShowGraceMinutes: number;
  bookingDefaultSlotMinutes: number;
  businessOpenTime: string;
  businessCloseTime: string;
  businessClosedWeekdays: number[];
  businessClosedDates: string[];
  updatedAt: string;
};

type BusinessHoursPatchPayload = Partial<{
  bookingLeadTimeMinutes: number;
  bookingNoShowGraceMinutes: number;
  bookingDefaultSlotMinutes: number;
  businessOpenTime: string;
  businessCloseTime: string;
  businessClosedWeekdays: number[];
  businessClosedDates: string[];
}>;

function sanitizeTemplateValue(value: string | undefined, fallback: string): string | undefined {
  if (value === undefined) return undefined;
  return value.trim().length > 0 ? value : fallback;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseTextField(
  input: Record<string, unknown>,
  fieldName: keyof SettingsPatchPayload,
  maxLength: number,
  options?: { nullable?: boolean; allowEmpty?: boolean },
): { hasValue: boolean; value?: string | null; error?: string } {
  if (!(fieldName in input)) return { hasValue: false };
  const value = input[fieldName];
  if (value == null && options?.nullable) return { hasValue: true, value: null };
  if (typeof value !== "string") return { hasValue: true, error: `${String(fieldName)} must be a string.` };

  const normalized = options?.allowEmpty ? value : value.trim();
  if (!options?.allowEmpty && normalized.length === 0 && !options?.nullable) {
    return { hasValue: true, error: `${String(fieldName)} cannot be empty.` };
  }
  if (normalized.length > maxLength) {
    return { hasValue: true, error: `${String(fieldName)} must be at most ${maxLength} characters.` };
  }
  return { hasValue: true, value: normalized };
}

function parseSettingsPatchBody(body: unknown): { ok: true; data: SettingsPatchPayload } | { ok: false; error: string } {
  const raw = asObject(body);
  if (!raw) return { ok: false, error: "Invalid request body." };

  const payload: SettingsPatchPayload = {};
  const fields: Array<{
    name: keyof SettingsPatchPayload;
    max: number;
    nullable?: boolean;
    allowEmpty?: boolean;
  }> = [
    { name: "restaurantName", max: 200 },
    { name: "taxRate", max: 20 },
    { name: "airconFee", max: 20 },
    { name: "currency", max: 20 },
    { name: "receiptFooter", max: 500, nullable: true, allowEmpty: true },
    { name: "notifyActivateEmailSubject", max: 250, allowEmpty: true },
    { name: "notifyActivateEmailBody", max: 6000, allowEmpty: true },
    { name: "notifyActivateSmsBody", max: 800, allowEmpty: true },
    { name: "notifyResetEmailSubject", max: 250, allowEmpty: true },
    { name: "notifyResetEmailBody", max: 6000, allowEmpty: true },
    { name: "notifyResetSmsBody", max: 800, allowEmpty: true },
  ];

  for (const field of fields) {
    const result = parseTextField(raw, field.name, field.max, {
      nullable: field.nullable,
      allowEmpty: field.allowEmpty,
    });
    if (result.error) return { ok: false, error: result.error };
    if (!result.hasValue) continue;
    payload[field.name] = result.value as never;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "At least one field is required." };
  }

  return { ok: true, data: payload };
}

function parseQueryString(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0].trim() : null;
  }
  return typeof value === "string" ? value.trim() : null;
}

function parseNotificationLogsQuery(query: unknown):
  | { ok: true; data: NotificationLogsQueryPayload }
  | { ok: false; error: string } {
  const raw = asObject(query) ?? {};
  const reason = parseQueryString(raw.reason);
  const channel = parseQueryString(raw.channel);
  const status = parseQueryString(raw.status);
  const startDate = parseQueryString(raw.startDate);
  const endDate = parseQueryString(raw.endDate);
  const limitRaw = parseQueryString(raw.limit);

  const data: NotificationLogsQueryPayload = {};
  if (reason) {
    if (reason !== "account_activated" && reason !== "password_reset") {
      return { ok: false, error: "Invalid reason filter." };
    }
    data.reason = reason;
  }
  if (channel) {
    if (channel !== "email" && channel !== "sms") {
      return { ok: false, error: "Invalid channel filter." };
    }
    data.channel = channel;
  }
  if (status) {
    if (status !== "sent" && status !== "failed" && status !== "skipped") {
      return { ok: false, error: "Invalid status filter." };
    }
    data.status = status;
  }
  if (startDate) {
    const parsedStart = new Date(startDate);
    if (Number.isNaN(parsedStart.getTime())) return { ok: false, error: "Invalid startDate filter." };
    data.startDate = startDate;
  }
  if (endDate) {
    const parsedEnd = new Date(endDate);
    if (Number.isNaN(parsedEnd.getTime())) return { ok: false, error: "Invalid endDate filter." };
    data.endDate = endDate;
  }
  if (limitRaw) {
    const parsedLimit = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
      return { ok: false, error: "limit must be between 1 and 500." };
    }
    data.limit = parsedLimit;
  }

  return { ok: true, data };
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  return (hour * 60) + minute;
}

function parseJsonNumberArray(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "number" ? Math.floor(entry) : Number.NaN))
      .filter((entry) => Number.isFinite(entry));
  } catch {
    return [];
  }
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function parseBusinessHoursPatchBody(body: unknown):
  | { ok: true; data: BusinessHoursPatchPayload }
  | { ok: false; error: string } {
  const raw = asObject(body);
  if (!raw) return { ok: false, error: "Invalid request body." };
  if (Object.keys(raw).length === 0) return { ok: false, error: "At least one field is required." };

  const payload: BusinessHoursPatchPayload = {};

  if ("bookingLeadTimeMinutes" in raw) {
    const parsed = Number.parseInt(String(raw.bookingLeadTimeMinutes), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24 * 60) {
      return { ok: false, error: "bookingLeadTimeMinutes must be between 1 and 1440." };
    }
    payload.bookingLeadTimeMinutes = parsed;
  }

  if ("bookingNoShowGraceMinutes" in raw) {
    const parsed = Number.parseInt(String(raw.bookingNoShowGraceMinutes), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 180) {
      return { ok: false, error: "bookingNoShowGraceMinutes must be between 1 and 180." };
    }
    payload.bookingNoShowGraceMinutes = parsed;
  }

  if ("bookingDefaultSlotMinutes" in raw) {
    const parsed = Number.parseInt(String(raw.bookingDefaultSlotMinutes), 10);
    if (!Number.isFinite(parsed) || parsed < 15 || parsed > 24 * 60) {
      return { ok: false, error: "bookingDefaultSlotMinutes must be between 15 and 1440." };
    }
    payload.bookingDefaultSlotMinutes = parsed;
  }

  if ("businessOpenTime" in raw) {
    if (typeof raw.businessOpenTime !== "string" || parseTimeToMinutes(raw.businessOpenTime) == null) {
      return { ok: false, error: "businessOpenTime must be in HH:MM (24-hour) format." };
    }
    payload.businessOpenTime = raw.businessOpenTime.trim();
  }

  if ("businessCloseTime" in raw) {
    if (typeof raw.businessCloseTime !== "string" || parseTimeToMinutes(raw.businessCloseTime) == null) {
      return { ok: false, error: "businessCloseTime must be in HH:MM (24-hour) format." };
    }
    payload.businessCloseTime = raw.businessCloseTime.trim();
  }

  if ("businessClosedWeekdays" in raw) {
    if (!Array.isArray(raw.businessClosedWeekdays)) {
      return { ok: false, error: "businessClosedWeekdays must be an array of 0-6." };
    }
    const weekdays = raw.businessClosedWeekdays
      .map((entry) => (typeof entry === "number" ? Math.floor(entry) : Number.NaN))
      .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6);
    if (weekdays.length !== raw.businessClosedWeekdays.length) {
      return { ok: false, error: "businessClosedWeekdays must only contain integers 0-6." };
    }
    payload.businessClosedWeekdays = [...new Set(weekdays)];
  }

  if ("businessClosedDates" in raw) {
    if (!Array.isArray(raw.businessClosedDates)) {
      return { ok: false, error: "businessClosedDates must be an array of YYYY-MM-DD strings." };
    }
    const dates = raw.businessClosedDates
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
    if (dates.length !== raw.businessClosedDates.length) {
      return { ok: false, error: "businessClosedDates must only contain YYYY-MM-DD date strings." };
    }
    payload.businessClosedDates = [...new Set(dates)];
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "At least one valid field is required." };
  }

  return { ok: true, data: payload };
}

function formatSettings(s: typeof settingsTable.$inferSelect) {
  return {
    ...s,
    taxRate: s.taxRate.toString(),
    airconFee: s.airconFee.toString(),
    businessClosedWeekdays: parseJsonNumberArray(s.businessClosedWeekdays),
    businessClosedDates: parseJsonStringArray(s.businessClosedDates),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function formatBusinessHours(settings: typeof settingsTable.$inferSelect): BusinessHoursSettingsResponse {
  return {
    bookingLeadTimeMinutes: settings.bookingLeadTimeMinutes,
    bookingNoShowGraceMinutes: settings.bookingNoShowGraceMinutes,
    bookingDefaultSlotMinutes: settings.bookingDefaultSlotMinutes,
    businessOpenTime: settings.businessOpenTime,
    businessCloseTime: settings.businessCloseTime,
    businessClosedWeekdays: parseJsonNumberArray(settings.businessClosedWeekdays),
    businessClosedDates: parseJsonStringArray(settings.businessClosedDates),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function parsePayload(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

router.get("/settings", requireRoles(["supervisor", "manager", "owner"]), async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    // Create default settings
    [settings] = await db.insert(settingsTable).values({}).returning();
  }
  res.json(formatSettings(settings));
});

router.patch("/settings", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  const parsed = parseSettingsPatchBody(req.body);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }

  let [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({}).returning();
  }

  const payload: Partial<typeof settingsTable.$inferInsert> = {
    ...parsed.data,
    notifyActivateEmailSubject: sanitizeTemplateValue(
      parsed.data.notifyActivateEmailSubject,
      DEFAULT_NOTIFICATION_TEMPLATES.notifyActivateEmailSubject,
    ),
    notifyActivateEmailBody: sanitizeTemplateValue(
      parsed.data.notifyActivateEmailBody,
      DEFAULT_NOTIFICATION_TEMPLATES.notifyActivateEmailBody,
    ),
    notifyActivateSmsBody: sanitizeTemplateValue(
      parsed.data.notifyActivateSmsBody,
      DEFAULT_NOTIFICATION_TEMPLATES.notifyActivateSmsBody,
    ),
    notifyResetEmailSubject: sanitizeTemplateValue(
      parsed.data.notifyResetEmailSubject,
      DEFAULT_NOTIFICATION_TEMPLATES.notifyResetEmailSubject,
    ),
    notifyResetEmailBody: sanitizeTemplateValue(
      parsed.data.notifyResetEmailBody,
      DEFAULT_NOTIFICATION_TEMPLATES.notifyResetEmailBody,
    ),
    notifyResetSmsBody: sanitizeTemplateValue(
      parsed.data.notifyResetSmsBody,
      DEFAULT_NOTIFICATION_TEMPLATES.notifyResetSmsBody,
    ),
  };
  if (payload.receiptFooter != null && payload.receiptFooter.trim().length === 0) {
    payload.receiptFooter = null;
  }

  const [updated] = await db.update(settingsTable).set(payload).where(eq(settingsTable.id, settings.id)).returning();
  res.json(formatSettings(updated));
});

router.get("/settings/notification-logs", requireRoles(["supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const parsed = parseNotificationLogsQuery(req.query);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const conditions = [];
  if (parsed.data.reason) conditions.push(eq(notificationLogsTable.reason, parsed.data.reason));
  if (parsed.data.channel) conditions.push(eq(notificationLogsTable.channel, parsed.data.channel));
  if (parsed.data.status) conditions.push(eq(notificationLogsTable.status, parsed.data.status));
  if (parsed.data.startDate) conditions.push(gte(notificationLogsTable.createdAt, new Date(parsed.data.startDate)));
  if (parsed.data.endDate) conditions.push(lte(notificationLogsTable.createdAt, new Date(parsed.data.endDate)));

  const logs = await (conditions.length > 0
    ? db
        .select()
        .from(notificationLogsTable)
        .where(and(...conditions))
        .orderBy(desc(notificationLogsTable.createdAt))
        .limit(parsed.data.limit ?? 100)
    : db
        .select()
        .from(notificationLogsTable)
        .orderBy(desc(notificationLogsTable.createdAt))
        .limit(parsed.data.limit ?? 100));

  const response: NotificationLogResponseItem[] = logs.map((row) => ({
    id: row.id,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    reason: row.reason,
    channel: row.channel,
    provider: row.provider,
    recipient: row.recipient ?? null,
    status: row.status,
    message: row.message ?? null,
    payload: parsePayload(row.payload ?? null),
    createdAt: row.createdAt.toISOString(),
  }));

  res.json(response);
});

router.get("/settings/business-hours", requireRoles(["supervisor", "manager", "owner"]), async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({}).returning();
  }
  res.json(formatBusinessHours(settings));
});

router.patch("/settings/business-hours", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  const parsed = parseBusinessHoursPatchBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  let [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({}).returning();
  }

  const nextOpen = parsed.data.businessOpenTime ?? settings.businessOpenTime;
  const nextClose = parsed.data.businessCloseTime ?? settings.businessCloseTime;
  const openMinutes = parseTimeToMinutes(nextOpen);
  const closeMinutes = parseTimeToMinutes(nextClose);
  if (openMinutes == null || closeMinutes == null || closeMinutes <= openMinutes) {
    res.status(400).json({ error: "businessCloseTime must be later than businessOpenTime." });
    return;
  }

  const payload: Partial<typeof settingsTable.$inferInsert> = {};
  if (parsed.data.bookingLeadTimeMinutes !== undefined) {
    payload.bookingLeadTimeMinutes = parsed.data.bookingLeadTimeMinutes;
  }
  if (parsed.data.bookingNoShowGraceMinutes !== undefined) {
    payload.bookingNoShowGraceMinutes = parsed.data.bookingNoShowGraceMinutes;
  }
  if (parsed.data.bookingDefaultSlotMinutes !== undefined) {
    payload.bookingDefaultSlotMinutes = parsed.data.bookingDefaultSlotMinutes;
  }
  if (parsed.data.businessOpenTime !== undefined) {
    payload.businessOpenTime = parsed.data.businessOpenTime;
  }
  if (parsed.data.businessCloseTime !== undefined) {
    payload.businessCloseTime = parsed.data.businessCloseTime;
  }
  if (parsed.data.businessClosedWeekdays !== undefined) {
    payload.businessClosedWeekdays = JSON.stringify(parsed.data.businessClosedWeekdays);
  }
  if (parsed.data.businessClosedDates !== undefined) {
    payload.businessClosedDates = JSON.stringify(parsed.data.businessClosedDates);
  }

  const [updated] = await db.update(settingsTable).set(payload).where(eq(settingsTable.id, settings.id)).returning();
  res.json(formatBusinessHours(updated));
});

export default router;
