import { and, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db, settingsTable, tableBookingsTable, tablesTable } from "@workspace/db";

const YANGON_TIME_ZONE = "Asia/Yangon";
const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const OPEN_BOOKING_STATUSES = ["confirmed", "checked_in"] as const;
const PENDING_AUTO_CANCEL_STATUSES = ["pending_payment", "confirmed"] as const;

function parsePositiveInt(value: unknown, fallback: number, min = 1, max = 24 * 60): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWeekdays(value: unknown): number[] {
  const parsed = parseJsonArray(value)
    .map((entry) => (typeof entry === "number" ? Math.floor(entry) : Number.NaN))
    .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6);
  return [...new Set(parsed)];
}

function parseClosedDates(value: unknown): string[] {
  const parsed = parseJsonArray(value)
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
  return [...new Set(parsed)];
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  return (hour * 60) + minute;
}

function extractYangonDateParts(value: Date): {
  dateKey: string;
  weekday: number;
  minutesOfDay: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: YANGON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const weekdayShort = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const weekday = WEEKDAY_MAP[weekdayShort] ?? 0;
  const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    dateKey,
    weekday,
    minutesOfDay: (hour * 60) + minute,
  };
}

export type BookingRuntimeConfig = {
  leadTimeMinutes: number;
  noShowGraceMinutes: number;
  defaultSlotMinutes: number;
  openTime: string;
  closeTime: string;
  closedWeekdays: number[];
  closedDates: string[];
};

export async function getBookingRuntimeConfig(executor: any = db): Promise<BookingRuntimeConfig> {
  const [settings] = await executor.select().from(settingsTable).limit(1);
  return {
    leadTimeMinutes: parsePositiveInt(settings?.bookingLeadTimeMinutes, 60, 1, 24 * 60),
    noShowGraceMinutes: parsePositiveInt(settings?.bookingNoShowGraceMinutes, 15, 1, 180),
    defaultSlotMinutes: parsePositiveInt(settings?.bookingDefaultSlotMinutes, 120, 15, 24 * 60),
    openTime: typeof settings?.businessOpenTime === "string" ? settings.businessOpenTime : "08:00",
    closeTime: typeof settings?.businessCloseTime === "string" ? settings.businessCloseTime : "22:00",
    closedWeekdays: parseWeekdays(settings?.businessClosedWeekdays),
    closedDates: parseClosedDates(settings?.businessClosedDates),
  };
}

export function validateBookingSlot(
  slotStartAt: Date,
  slotEndAt: Date,
  config: BookingRuntimeConfig,
): string | null {
  const openMinutes = parseTimeToMinutes(config.openTime);
  const closeMinutes = parseTimeToMinutes(config.closeTime);
  if (openMinutes == null || closeMinutes == null || closeMinutes <= openMinutes) {
    return "Business hours settings are invalid. Please update open/close times.";
  }

  const start = extractYangonDateParts(slotStartAt);
  const end = extractYangonDateParts(slotEndAt);
  if (start.dateKey !== end.dateKey) {
    return "Booking time slot must be within the same business day.";
  }
  if (config.closedWeekdays.includes(start.weekday)) {
    return "Selected booking date is closed for this weekday.";
  }
  if (config.closedDates.includes(start.dateKey)) {
    return "Selected booking date is marked as a closed holiday.";
  }
  if (start.minutesOfDay < openMinutes || end.minutesOfDay > closeMinutes) {
    return `Booking slot must be within business hours (${config.openTime} - ${config.closeTime}).`;
  }
  return null;
}

export function computeAutoCancelAt(slotStartAt: Date, noShowGraceMinutes: number): Date {
  return new Date(slotStartAt.getTime() + (noShowGraceMinutes * 60_000));
}

export async function syncTableBookedFlag(tableId: number, executor: any = db): Promise<void> {
  if (!Number.isFinite(tableId) || tableId <= 0) return;
  const now = new Date();
  const [activeReserved] = await executor
    .select({ id: tableBookingsTable.id })
    .from(tableBookingsTable)
    .where(and(
      eq(tableBookingsTable.tableId, tableId),
      eq(tableBookingsTable.status, "confirmed"),
      isNull(tableBookingsTable.checkInAt),
      gt(tableBookingsTable.autoCancelAt, now),
    ));

  await executor
    .update(tablesTable)
    .set({ isBooked: Boolean(activeReserved) })
    .where(eq(tablesTable.id, tableId));
}

export async function syncTableBookedFlags(tableIds: number[], executor: any = db): Promise<void> {
  const unique = [...new Set(tableIds.filter((tableId) => Number.isFinite(tableId) && tableId > 0))];
  for (const tableId of unique) {
    await syncTableBookedFlag(tableId, executor);
  }
}

export async function autoCancelExpiredBookings(executor: any = db): Promise<number> {
  const now = new Date();
  const expired: Array<{ id: number; tableId: number }> = await executor
    .select({
      id: tableBookingsTable.id,
      tableId: tableBookingsTable.tableId,
    })
    .from(tableBookingsTable)
    .where(and(
      inArray(tableBookingsTable.status, PENDING_AUTO_CANCEL_STATUSES as unknown as string[]),
      isNull(tableBookingsTable.checkInAt),
      lte(tableBookingsTable.autoCancelAt, now),
    ));

  if (expired.length === 0) return 0;
  const bookingIds = expired.map((entry) => entry.id);
  const affectedTableIds = expired.map((entry) => entry.tableId);

  await executor
    .update(tableBookingsTable)
    .set({
      status: "cancelled",
      cancelReason: "auto_cancel_no_checkin",
    })
    .where(inArray(tableBookingsTable.id, bookingIds));

  await syncTableBookedFlags(affectedTableIds, executor);
  return bookingIds.length;
}

export async function markBookingOrderStartedForTable(
  tableId: number,
  orderId: number,
  executor: any = db,
): Promise<number | null> {
  if (!Number.isFinite(tableId) || tableId <= 0) return null;
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const [booking] = await executor
    .select()
    .from(tableBookingsTable)
    .where(and(
      eq(tableBookingsTable.tableId, tableId),
      inArray(tableBookingsTable.status, OPEN_BOOKING_STATUSES as unknown as string[]),
      isNull(tableBookingsTable.checkOutAt),
    ))
    .orderBy(desc(tableBookingsTable.checkInAt), desc(tableBookingsTable.slotStartAt), desc(tableBookingsTable.createdAt));

  if (!booking) return null;

  const now = new Date();
  const payload: Partial<typeof tableBookingsTable.$inferInsert> = {
    orderAt: booking.orderAt ?? now,
    orderId: booking.orderId ?? orderId,
  };

  if (booking.status === "confirmed" && booking.checkInAt == null) {
    payload.status = "checked_in";
    payload.checkInAt = now;
  }

  await executor
    .update(tableBookingsTable)
    .set(payload)
    .where(eq(tableBookingsTable.id, booking.id));

  await syncTableBookedFlag(tableId, executor);
  return booking.id;
}

export async function markBookingCheckoutForTable(tableId: number, executor: any = db): Promise<number | null> {
  if (!Number.isFinite(tableId) || tableId <= 0) return null;

  const [booking] = await executor
    .select()
    .from(tableBookingsTable)
    .where(and(
      eq(tableBookingsTable.tableId, tableId),
      eq(tableBookingsTable.status, "checked_in"),
      isNull(tableBookingsTable.checkOutAt),
    ))
    .orderBy(desc(tableBookingsTable.checkInAt), desc(tableBookingsTable.slotStartAt), desc(tableBookingsTable.createdAt));

  if (!booking) return null;

  await executor
    .update(tableBookingsTable)
    .set({
      status: "completed",
      checkOutAt: new Date(),
    })
    .where(eq(tableBookingsTable.id, booking.id));

  await syncTableBookedFlag(tableId, executor);
  return booking.id;
}
