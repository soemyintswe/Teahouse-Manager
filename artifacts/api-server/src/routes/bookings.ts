import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, tableBookingsTable, tablesTable } from "@workspace/db";
import { requireRoles } from "../lib/auth";
import {
  autoCancelExpiredBookings,
  computeAutoCancelAt,
  getBookingRuntimeConfig,
  syncTableBookedFlag,
  validateBookingSlot,
} from "../lib/bookings";

const router: IRouter = Router();

const BOOKING_MANAGE_ROLES = ["waiter", "cashier", "cleaner", "room_supervisor", "supervisor", "manager", "owner"] as const;
const BOOKING_VIEW_ROLES = ["waiter", "cashier", "cleaner", "room_supervisor", "supervisor", "manager", "owner"] as const;
const BOOKING_STATUSES = ["pending_payment", "confirmed", "checked_in", "cancelled", "completed"] as const;
const BLOCKING_BOOKING_STATUSES = ["pending_payment", "confirmed", "checked_in"] as const;

type CreateBookingBody = {
  tableId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  slotStartAt?: unknown;
  slotMinutes?: unknown;
  bookingFee?: unknown;
  preorderAmount?: unknown;
  bookingFeePaid?: unknown;
  preorderAmountPaid?: unknown;
  notes?: unknown;
  staffId?: unknown;
};

type UpdateBookingPaymentBody = {
  bookingFeePaid?: unknown;
  preorderAmountPaid?: unknown;
};

type ExtendBookingBody = {
  extendMinutes?: unknown;
};

type CancelBookingBody = {
  reason?: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseId(input: unknown): number {
  const normalized = Array.isArray(input) ? input[0] : input;
  const parsed = typeof normalized === "number" ? normalized : Number.parseInt(String(normalized ?? ""), 10);
  return Number.isFinite(parsed) ? Math.floor(parsed) : Number.NaN;
}

function parseOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function parseMoney(value: unknown, fallback = "0.00"): string | null {
  if (value == null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed.toFixed(2);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

function parseStatus(value: unknown): (typeof BOOKING_STATUSES)[number] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((BOOKING_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as (typeof BOOKING_STATUSES)[number];
  }
  return null;
}

function formatBooking(row: typeof tableBookingsTable.$inferSelect) {
  return {
    id: row.id,
    tableId: row.tableId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    slotStartAt: row.slotStartAt.toISOString(),
    slotEndAt: row.slotEndAt.toISOString(),
    extensionMinutes: row.extensionMinutes,
    bookingFee: row.bookingFee.toString(),
    preorderAmount: row.preorderAmount.toString(),
    bookingFeePaid: row.bookingFeePaid,
    preorderAmountPaid: row.preorderAmountPaid,
    status: row.status,
    autoCancelAt: row.autoCancelAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    checkInAt: row.checkInAt?.toISOString() ?? null,
    orderAt: row.orderAt?.toISOString() ?? null,
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    orderId: row.orderId ?? null,
    cancelReason: row.cancelReason ?? null,
    notes: row.notes ?? null,
    createdByStaffId: row.createdByStaffId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/bookings/active", requireRoles(BOOKING_VIEW_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();

  const tableId = parseOptionalInt(req.query.tableId);
  const statuses = ["pending_payment", "confirmed", "checked_in"];
  const conditions = [inArray(tableBookingsTable.status, statuses)];
  if (tableId && tableId > 0) {
    conditions.push(eq(tableBookingsTable.tableId, tableId));
  }

  const rows = await db
    .select()
    .from(tableBookingsTable)
    .where(and(...conditions))
    .orderBy(desc(tableBookingsTable.slotStartAt), desc(tableBookingsTable.createdAt));

  res.json(rows.map(formatBooking));
});

router.get("/bookings", requireRoles(BOOKING_VIEW_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();

  const status = parseStatus(req.query.status);
  if (req.query.status !== undefined && !status) {
    res.status(400).json({ error: "Invalid booking status filter." });
    return;
  }
  const tableId = parseOptionalInt(req.query.tableId);
  if (req.query.tableId !== undefined && (!tableId || tableId <= 0)) {
    res.status(400).json({ error: "Invalid tableId filter." });
    return;
  }
  const fromRaw = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const toRaw = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if (fromRaw && Number.isNaN(fromRaw.getTime())) {
    res.status(400).json({ error: "Invalid from date filter." });
    return;
  }
  if (toRaw && Number.isNaN(toRaw.getTime())) {
    res.status(400).json({ error: "Invalid to date filter." });
    return;
  }
  const limitRaw = parseOptionalInt(req.query.limit);
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

  const conditions = [];
  if (status) conditions.push(eq(tableBookingsTable.status, status));
  if (tableId && tableId > 0) conditions.push(eq(tableBookingsTable.tableId, tableId));
  if (fromRaw) conditions.push(gte(tableBookingsTable.slotStartAt, fromRaw));
  if (toRaw) conditions.push(lte(tableBookingsTable.slotStartAt, toRaw));

  const rows = await (conditions.length > 0
    ? db
        .select()
        .from(tableBookingsTable)
        .where(and(...conditions))
        .orderBy(desc(tableBookingsTable.slotStartAt), desc(tableBookingsTable.createdAt))
        .limit(limit)
    : db
        .select()
        .from(tableBookingsTable)
        .orderBy(desc(tableBookingsTable.slotStartAt), desc(tableBookingsTable.createdAt))
        .limit(limit));

  res.json(rows.map(formatBooking));
});

router.post("/bookings", requireRoles(BOOKING_MANAGE_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const body = (req.body ?? {}) as CreateBookingBody;
  const tableId = parseOptionalInt(body.tableId);
  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
  const slotStartAt = typeof body.slotStartAt === "string" ? new Date(body.slotStartAt) : null;
  const slotMinutesRaw = parseOptionalInt(body.slotMinutes);
  const bookingFee = parseMoney(body.bookingFee, "0.00");
  const preorderAmount = parseMoney(body.preorderAmount, "0.00");
  const bookingFeePaid = parseBoolean(body.bookingFeePaid, false);
  const preorderAmountPaid = parseBoolean(body.preorderAmountPaid, false);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const createdByStaffId = parseOptionalInt(body.staffId) ?? req.auth?.staffId ?? null;

  if (!tableId || tableId <= 0) {
    res.status(400).json({ error: "tableId is required." });
    return;
  }
  if (!customerName || customerName.length > 120) {
    res.status(400).json({ error: "customerName is required and must be at most 120 characters." });
    return;
  }
  if (!customerPhone || customerPhone.length > 40) {
    res.status(400).json({ error: "customerPhone is required and must be at most 40 characters." });
    return;
  }
  if (!slotStartAt || Number.isNaN(slotStartAt.getTime())) {
    res.status(400).json({ error: "slotStartAt is required and must be a valid date-time." });
    return;
  }
  if (!bookingFee || !preorderAmount) {
    res.status(400).json({ error: "bookingFee and preorderAmount must be valid non-negative numbers." });
    return;
  }

  const config = await getBookingRuntimeConfig();
  const slotMinutes = slotMinutesRaw && slotMinutesRaw > 0 ? Math.min(slotMinutesRaw, 24 * 60) : config.defaultSlotMinutes;
  if (slotMinutes < 15) {
    res.status(400).json({ error: "slotMinutes must be at least 15 minutes." });
    return;
  }

  const now = new Date();
  const leadTimeMs = config.leadTimeMinutes * 60_000;
  if (slotStartAt.getTime() - now.getTime() < leadTimeMs) {
    res.status(400).json({ error: `Booking must be made at least ${config.leadTimeMinutes} minutes in advance.` });
    return;
  }

  const slotEndAt = new Date(slotStartAt.getTime() + (slotMinutes * 60_000));
  const slotValidationError = validateBookingSlot(slotStartAt, slotEndAt, config);
  if (slotValidationError) {
    res.status(400).json({ error: slotValidationError });
    return;
  }

  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, tableId));
  if (!table) {
    res.status(404).json({ error: "Table not found." });
    return;
  }
  if (table.status !== "Active") {
    res.status(409).json({ error: "Booking is only allowed for active tables." });
    return;
  }
  if (table.occupancyStatus !== "available" || table.currentOrderId != null) {
    res.status(409).json({ error: "Only available tables can accept bookings." });
    return;
  }
  if (table.isBooked) {
    res.status(409).json({ error: "Table is already reserved." });
    return;
  }

  const existingBookings = await db
    .select()
    .from(tableBookingsTable)
    .where(and(
      eq(tableBookingsTable.tableId, tableId),
      inArray(tableBookingsTable.status, BLOCKING_BOOKING_STATUSES as unknown as string[]),
      isNull(tableBookingsTable.checkOutAt),
    ));

  const hasConflict = existingBookings.some((existing) => {
    if (existing.status === "checked_in") return true;
    const existingStart = new Date(existing.slotStartAt).getTime();
    const existingEnd = new Date(existing.slotEndAt).getTime();
    return existingStart < slotEndAt.getTime() && existingEnd > slotStartAt.getTime();
  });
  if (hasConflict) {
    res.status(409).json({ error: "Table already has another booking in this time slot." });
    return;
  }

  const allPaid = bookingFeePaid && preorderAmountPaid;
  const [created] = await db
    .insert(tableBookingsTable)
    .values({
      tableId,
      customerName,
      customerPhone,
      slotStartAt,
      slotEndAt,
      extensionMinutes: 0,
      bookingFee,
      preorderAmount,
      bookingFeePaid,
      preorderAmountPaid,
      status: allPaid ? "confirmed" : "pending_payment",
      autoCancelAt: computeAutoCancelAt(slotStartAt, config.noShowGraceMinutes),
      confirmedAt: allPaid ? new Date() : null,
      notes: notes || null,
      createdByStaffId,
    })
    .returning();

  await syncTableBookedFlag(tableId);
  res.status(201).json(formatBooking(created));
});

router.patch("/bookings/:id/payment-status", requireRoles(BOOKING_MANAGE_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const bookingId = parseId(req.params.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "Invalid booking id." });
    return;
  }

  const body = (req.body ?? {}) as UpdateBookingPaymentBody;
  if (body.bookingFeePaid === undefined && body.preorderAmountPaid === undefined) {
    res.status(400).json({ error: "At least one payment status field is required." });
    return;
  }

  const [booking] = await db.select().from(tableBookingsTable).where(eq(tableBookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if (booking.status === "cancelled" || booking.status === "completed") {
    res.status(409).json({ error: "Cannot update payment status for closed booking." });
    return;
  }

  const nextBookingFeePaid = body.bookingFeePaid === undefined ? booking.bookingFeePaid : parseBoolean(body.bookingFeePaid);
  const nextPreorderAmountPaid = body.preorderAmountPaid === undefined
    ? booking.preorderAmountPaid
    : parseBoolean(body.preorderAmountPaid);
  const allPaid = nextBookingFeePaid && nextPreorderAmountPaid;

  const payload: Partial<typeof tableBookingsTable.$inferInsert> = {
    bookingFeePaid: nextBookingFeePaid,
    preorderAmountPaid: nextPreorderAmountPaid,
  };
  if (booking.status !== "checked_in") {
    payload.status = allPaid ? "confirmed" : "pending_payment";
    payload.confirmedAt = allPaid ? (booking.confirmedAt ?? new Date()) : null;
  }

  const [updated] = await db
    .update(tableBookingsTable)
    .set(payload)
    .where(eq(tableBookingsTable.id, booking.id))
    .returning();

  await syncTableBookedFlag(booking.tableId);
  res.json(formatBooking(updated));
});

router.post("/bookings/:id/extend", requireRoles(BOOKING_MANAGE_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const bookingId = parseId(req.params.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "Invalid booking id." });
    return;
  }

  const body = (req.body ?? {}) as ExtendBookingBody;
  const extendMinutes = parseOptionalInt(body.extendMinutes);
  if (!extendMinutes || extendMinutes <= 0 || extendMinutes > 24 * 60) {
    res.status(400).json({ error: "extendMinutes must be between 1 and 1440." });
    return;
  }

  const [booking] = await db.select().from(tableBookingsTable).where(eq(tableBookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if (booking.checkInAt != null) {
    res.status(409).json({ error: "Checked-in booking cannot be extended in this flow." });
    return;
  }
  if (booking.status !== "pending_payment" && booking.status !== "confirmed") {
    res.status(409).json({ error: "Only pending/confirmed bookings can be extended." });
    return;
  }
  if (new Date(booking.autoCancelAt).getTime() <= Date.now()) {
    res.status(409).json({ error: "Booking is already expired and cannot be extended." });
    return;
  }

  const currentDurationMinutes = Math.max(
    1,
    Math.round((new Date(booking.slotEndAt).getTime() - new Date(booking.slotStartAt).getTime()) / 60_000),
  );
  const currentBookingFee = Number.parseFloat(booking.bookingFee.toString());
  const additionalFee = Number.isFinite(currentBookingFee)
    ? (currentBookingFee * extendMinutes) / currentDurationMinutes
    : 0;
  const nextBookingFee = (currentBookingFee + additionalFee).toFixed(2);

  const nextSlotEndAt = new Date(new Date(booking.slotEndAt).getTime() + (extendMinutes * 60_000));
  const nextAutoCancelAt = new Date(new Date(booking.autoCancelAt).getTime() + (extendMinutes * 60_000));
  const config = await getBookingRuntimeConfig();
  const slotValidationError = validateBookingSlot(new Date(booking.slotStartAt), nextSlotEndAt, config);
  if (slotValidationError) {
    res.status(400).json({ error: slotValidationError });
    return;
  }

  const shouldResetBookingFeePaid = additionalFee > 0.0001 && booking.bookingFeePaid;
  const nextBookingFeePaid = shouldResetBookingFeePaid ? false : booking.bookingFeePaid;
  const allPaid = nextBookingFeePaid && booking.preorderAmountPaid;

  const [updated] = await db
    .update(tableBookingsTable)
    .set({
      extensionMinutes: booking.extensionMinutes + extendMinutes,
      slotEndAt: nextSlotEndAt,
      autoCancelAt: nextAutoCancelAt,
      bookingFee: nextBookingFee,
      bookingFeePaid: nextBookingFeePaid,
      status: allPaid ? "confirmed" : "pending_payment",
      confirmedAt: allPaid ? booking.confirmedAt ?? new Date() : null,
    })
    .where(eq(tableBookingsTable.id, booking.id))
    .returning();

  await syncTableBookedFlag(updated.tableId);
  res.json({
    booking: formatBooking(updated),
    additionalFee: additionalFee.toFixed(2),
  });
});

router.post("/bookings/:id/check-in", requireRoles(BOOKING_MANAGE_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const bookingId = parseId(req.params.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "Invalid booking id." });
    return;
  }

  const [booking] = await db.select().from(tableBookingsTable).where(eq(tableBookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if (booking.status !== "confirmed") {
    res.status(409).json({ error: "Only paid confirmed bookings can be checked in." });
    return;
  }
  if (booking.checkInAt != null) {
    res.status(409).json({ error: "Booking already checked in." });
    return;
  }

  const [updated] = await db
    .update(tableBookingsTable)
    .set({
      status: "checked_in",
      checkInAt: new Date(),
    })
    .where(eq(tableBookingsTable.id, booking.id))
    .returning();

  await db
    .update(tablesTable)
    .set({
      isBooked: false,
      occupancyStatus: "occupied",
    })
    .where(eq(tablesTable.id, booking.tableId));

  res.json(formatBooking(updated));
});

router.post("/bookings/:id/check-out", requireRoles(BOOKING_MANAGE_ROLES), async (req, res): Promise<void> => {
  const bookingId = parseId(req.params.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "Invalid booking id." });
    return;
  }

  const [booking] = await db.select().from(tableBookingsTable).where(eq(tableBookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if (booking.status !== "checked_in") {
    res.status(409).json({ error: "Only checked-in bookings can be checked out." });
    return;
  }

  const [updated] = await db
    .update(tableBookingsTable)
    .set({
      status: "completed",
      checkOutAt: new Date(),
    })
    .where(eq(tableBookingsTable.id, booking.id))
    .returning();

  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, booking.tableId));
  if (table && table.currentOrderId == null && table.occupancyStatus !== "available") {
    await db
      .update(tablesTable)
      .set({ occupancyStatus: "available" })
      .where(eq(tablesTable.id, booking.tableId));
  }
  await syncTableBookedFlag(booking.tableId);
  res.json(formatBooking(updated));
});

router.post("/bookings/:id/cancel", requireRoles(BOOKING_MANAGE_ROLES), async (req, res): Promise<void> => {
  const bookingId = parseId(req.params.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "Invalid booking id." });
    return;
  }

  const body = (req.body ?? {}) as CancelBookingBody;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const [booking] = await db.select().from(tableBookingsTable).where(eq(tableBookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if (booking.status === "cancelled" || booking.status === "completed") {
    res.status(409).json({ error: "Booking is already closed." });
    return;
  }

  const [updated] = await db
    .update(tableBookingsTable)
    .set({
      status: "cancelled",
      cancelReason: reason || "manual_cancel",
    })
    .where(eq(tableBookingsTable.id, booking.id))
    .returning();

  await syncTableBookedFlag(booking.tableId);
  res.json(formatBooking(updated));
});

export default router;
