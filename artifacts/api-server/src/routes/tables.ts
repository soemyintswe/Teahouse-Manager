import { Router, type IRouter } from "express";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  billingAuditLogsTable,
  db,
  ordersTable,
  roomsTable,
  tableMergeGroupsTable,
  tableSeatSessionsTable,
  tablesTable,
} from "@workspace/db";
import { canAccessTable, requireAuth, requireRoles } from "../lib/auth";
import { autoCancelExpiredBookings, markBookingCheckoutForTable } from "../lib/bookings";
import { syncTableOccupancyFromSeatSessions } from "../lib/seat-sessions";
import {
  CreateTableBody,
  GetTableParams,
  GetTableResponse,
  UpdateTableParams,
  UpdateTableBody,
  UpdateTableResponse,
  DeleteTableParams,
  ListTablesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const ADMIN_ROLES = ["supervisor", "manager", "owner"] as const;

const roomCodeRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CreateRoomPayload = {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type UpdateRoomPayload = Partial<CreateRoomPayload>;
type RenumberTablesPayload = {
  zone?: unknown;
};
type MergeTablesPayload = {
  tableIds?: unknown;
  anchorTableId?: unknown;
  staffId?: unknown;
};
type ReleaseMergePayload = {
  staffId?: unknown;
};
type CreateSeatSessionPayload = {
  slotCode?: unknown;
  groupName?: unknown;
  notes?: unknown;
  staffId?: unknown;
};
type UpdateSeatSessionPayload = {
  status?: unknown;
  currentOrderId?: unknown;
  notes?: unknown;
  groupName?: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRoomId(input: string | string[] | undefined): number | null {
  const value = Array.isArray(input) ? input[0] : input;
  if (!value) return null;
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseCreateRoomBody(body: unknown): { ok: true; data: CreateRoomPayload } | { ok: false; error: string } {
  const raw = asObject(body);
  if (!raw) return { ok: false, error: "Invalid request body." };

  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const isActive = typeof raw.isActive === "boolean" ? raw.isActive : true;
  const sortOrder = typeof raw.sortOrder === "number" && Number.isInteger(raw.sortOrder) ? raw.sortOrder : 0;

  if (!code || code.length > 40 || !roomCodeRegex.test(code)) {
    return { ok: false, error: "Room code must be lowercase letters, numbers, and dashes." };
  }
  if (!name || name.length > 120) {
    return { ok: false, error: "Room name is required and must be at most 120 characters." };
  }

  return { ok: true, data: { code, name, isActive, sortOrder } };
}

function parseUpdateRoomBody(body: unknown): { ok: true; data: UpdateRoomPayload } | { ok: false; error: string } {
  const raw = asObject(body);
  if (!raw) return { ok: false, error: "Invalid request body." };
  if (Object.keys(raw).length === 0) return { ok: false, error: "At least one field is required." };

  const payload: UpdateRoomPayload = {};

  if ("code" in raw) {
    if (typeof raw.code !== "string") return { ok: false, error: "Invalid room code." };
    const code = raw.code.trim();
    if (!code || code.length > 40 || !roomCodeRegex.test(code)) {
      return { ok: false, error: "Room code must be lowercase letters, numbers, and dashes." };
    }
    payload.code = code;
  }

  if ("name" in raw) {
    if (typeof raw.name !== "string") return { ok: false, error: "Invalid room name." };
    const name = raw.name.trim();
    if (!name || name.length > 120) {
      return { ok: false, error: "Room name is required and must be at most 120 characters." };
    }
    payload.name = name;
  }

  if ("isActive" in raw) {
    if (typeof raw.isActive !== "boolean") return { ok: false, error: "Invalid room active flag." };
    payload.isActive = raw.isActive;
  }

  if ("sortOrder" in raw) {
    if (typeof raw.sortOrder !== "number" || !Number.isInteger(raw.sortOrder)) {
      return { ok: false, error: "Sort order must be an integer." };
    }
    payload.sortOrder = raw.sortOrder;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "At least one valid field is required." };
  }

  return { ok: true, data: payload };
}

function parseId(input: string | string[] | undefined): number {
  return parseInt(Array.isArray(input) ? input[0] : input ?? "", 10);
}

function parseInteger(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return Math.floor(input);
  if (typeof input === "string") {
    const parsed = Number.parseInt(input, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseIdArray(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const ids: number[] = [];
  for (const value of input) {
    const parsed = parseInteger(value);
    if (parsed && parsed > 0) ids.push(parsed);
  }
  return [...new Set(ids)];
}

function parseMergedTableIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids = parsed
      .map((value) => (typeof value === "number" ? Math.floor(value) : Number.NaN))
      .filter((value) => Number.isFinite(value) && value > 0);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

function computeDistance(left: { posX: number; posY: number }, right: { posX: number; posY: number }): number {
  const dx = left.posX - right.posX;
  const dy = left.posY - right.posY;
  return Math.sqrt((dx * dx) + (dy * dy));
}

const SEAT_SESSION_STATUSES = ["active", "payment_pending", "paid", "cleaning", "closed"] as const;
type SeatSessionStatus = (typeof SEAT_SESSION_STATUSES)[number];

function parseSeatSessionStatus(value: unknown): SeatSessionStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((SEAT_SESSION_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as SeatSessionStatus;
  }
  return null;
}

function resolveNextSlotCode(existing: string[]): string {
  const used = new Set(
    existing
      .map((slot) => {
        const match = /^S(\d+)$/i.exec(slot.trim());
        if (!match) return null;
        const parsed = Number.parseInt(match[1], 10);
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((value): value is number => value != null),
  );
  let next = 1;
  while (used.has(next)) next += 1;
  return `S${next}`;
}

function toIsoTable(table: typeof tablesTable.$inferSelect) {
  return {
    ...table,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

function toIsoRoom(room: typeof roomsTable.$inferSelect) {
  return {
    ...room,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

async function validateRoomCodeExists(zoneCode: string): Promise<boolean> {
  const [room] = await db.select({ id: roomsTable.id }).from(roomsTable).where(eq(roomsTable.code, zoneCode));
  return Boolean(room);
}

function getZonePrefix(zoneCode: string): string {
  const upper = zoneCode.trim().toUpperCase();
  for (const char of upper) {
    if (char >= "A" && char <= "Z") return char;
  }
  return "T";
}

function getLeadingLetters(value: string): string | null {
  const match = /^([A-Z]+)/.exec(value.trim().toUpperCase());
  if (!match) return null;
  return match[1] ?? null;
}

function getTailNumber(value: string): number | null {
  const match = /(\d+)$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function choosePreferredPrefix(zoneCode: string, tableNumbers: string[]): string {
  const fallback = getZonePrefix(zoneCode);
  const frequency = new Map<string, number>();

  for (const tableNumber of tableNumbers) {
    const prefix = getLeadingLetters(tableNumber);
    if (!prefix) continue;
    frequency.set(prefix, (frequency.get(prefix) ?? 0) + 1);
  }

  if (frequency.size === 0) return fallback;

  const sorted = [...frequency.entries()].sort((a, b) => {
    const diff = b[1] - a[1];
    if (diff !== 0) return diff;
    return a[0].localeCompare(b[0]);
  });

  return sorted[0]?.[0] ?? fallback;
}

function compareTableNumberForRenumber(a: string, b: string): number {
  const left = getTailNumber(a);
  const right = getTailNumber(b);

  if (left != null && right != null && left !== right) {
    return left - right;
  }
  if (left != null && right == null) return -1;
  if (left == null && right != null) return 1;

  const leftPrefix = getLeadingLetters(a) ?? "";
  const rightPrefix = getLeadingLetters(b) ?? "";
  const prefixDiff = leftPrefix.localeCompare(rightPrefix);
  if (prefixDiff !== 0) return prefixDiff;

  return a.localeCompare(b, undefined, { numeric: true });
}

async function normalizeZoneTableNumbers(zoneCode: string): Promise<number> {
  const zoneTables = await db.select().from(tablesTable).where(eq(tablesTable.zone, zoneCode));
  if (zoneTables.length === 0) return 0;

  const prefix = choosePreferredPrefix(zoneCode, zoneTables.map((row) => row.tableNumber));
  const ordered = [...zoneTables].sort((a, b) => {
    const archivedRankDiff =
      (a.status === "Archived" ? 1 : 0) - (b.status === "Archived" ? 1 : 0);
    if (archivedRankDiff !== 0) return archivedRankDiff;

    const byTableNumber = compareTableNumberForRenumber(a.tableNumber, b.tableNumber);
    if (byTableNumber !== 0) return byTableNumber;
    return a.id - b.id;
  });

  let updatedCount = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i];
    const nextTableNumber = `${prefix}${i + 1}`;
    if (row.tableNumber === nextTableNumber) continue;
    await db.update(tablesTable).set({ tableNumber: nextTableNumber }).where(eq(tablesTable.id, row.id));
    updatedCount += 1;
  }

  return updatedCount;
}

async function resolveAutoTableNumber(zoneCode: string, requested: string | null | undefined, excludeId?: number): Promise<string> {
  const requestedNumber = requested ? getTailNumber(requested) : null;

  const rows = await db.select({ id: tablesTable.id, zone: tablesTable.zone, tableNumber: tablesTable.tableNumber }).from(tablesTable);
  const sameZoneRows = rows.filter((row) => (excludeId == null || row.id !== excludeId) && row.zone === zoneCode);
  const prefix = choosePreferredPrefix(zoneCode, sameZoneRows.map((row) => row.tableNumber));
  const usedByPrefix = new Set<number>();
  const usedNumbers = new Set<string>();

  for (const row of rows) {
    if (excludeId != null && row.id === excludeId) continue;
    const normalized = row.tableNumber.trim().toUpperCase();
    usedNumbers.add(normalized);
    if (!normalized.startsWith(prefix)) continue;
    const tail = getTailNumber(normalized);
    if (tail != null) usedByPrefix.add(tail);
  }

  if (requestedNumber != null) {
    const candidate = `${prefix}${requestedNumber}`;
    if (!usedNumbers.has(candidate) && !usedByPrefix.has(requestedNumber)) {
      return candidate;
    }
  }

  let nextNumber = 1;
  while (usedByPrefix.has(nextNumber) || usedNumbers.has(`${prefix}${nextNumber}`)) {
    nextNumber += 1;
  }

  return `${prefix}${nextNumber}`;
}

router.get("/rooms", requireRoles(["waiter", "kitchen", "cashier", "supervisor", "manager", "owner"]), async (_req, res): Promise<void> => {
  const rooms = await db.select().from(roomsTable).orderBy(roomsTable.sortOrder, roomsTable.name);
  res.json(rooms.map(toIsoRoom));
});

router.post("/rooms", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const parsed = parseCreateRoomBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const payload = parsed.data;

  const [existing] = await db.select({ id: roomsTable.id }).from(roomsTable).where(eq(roomsTable.code, payload.code));
  if (existing) {
    res.status(409).json({ error: "Room code already exists." });
    return;
  }

  const [room] = await db.insert(roomsTable).values(payload).returning();
  res.status(201).json(toIsoRoom(room));
});

router.patch("/rooms/:id", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const roomId = parseRoomId(req.params.id);
  if (!roomId) {
    res.status(400).json({ error: "Invalid room id." });
    return;
  }

  const parsed = parseUpdateRoomBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const [currentRoom] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
  if (!currentRoom) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const payload = parsed.data;

  if (payload.code) {
    const [duplicate] = await db
      .select({ id: roomsTable.id })
      .from(roomsTable)
      .where(eq(roomsTable.code, payload.code));
    if (duplicate && duplicate.id !== roomId) {
      res.status(409).json({ error: "Room code already exists." });
      return;
    }
  }

  const [updated] = await db.update(roomsTable).set(payload).where(eq(roomsTable.id, roomId)).returning();

  if (payload.code) {
    await db
      .update(tablesTable)
      .set({ zone: payload.code })
      .where(eq(tablesTable.zone, currentRoom.code));
    await normalizeZoneTableNumbers(payload.code);
  }

  res.json(toIsoRoom(updated));
});

router.delete("/rooms/:id", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const roomId = parseRoomId(req.params.id);
  if (!roomId) {
    res.status(400).json({ error: "Invalid room id." });
    return;
  }

  const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const [{ value: linkedTablesCount }] = await db
    .select({ value: count() })
    .from(tablesTable)
    .where(eq(tablesTable.zone, room.code));

  if (linkedTablesCount > 0) {
    res.status(409).json({ error: "Cannot delete room with linked tables." });
    return;
  }

  await db.delete(roomsTable).where(eq(roomsTable.id, room.id));
  res.sendStatus(204);
});

router.get("/tables", requireRoles(["waiter", "kitchen", "cashier", "supervisor", "manager", "owner"]), async (_req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const tables = await db.select().from(tablesTable).orderBy(tablesTable.zone, tablesTable.tableNumber);
  res.json(ListTablesResponse.parse(tables.map(toIsoTable)));
});

router.post("/tables", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await validateRoomCodeExists(parsed.data.zone))) {
    res.status(400).json({ error: "Room does not exist for this zone code." });
    return;
  }

  const tableNumber = await resolveAutoTableNumber(parsed.data.zone, parsed.data.tableNumber);

  const qrCode = `table-${tableNumber}-${Date.now()}`;
  const [table] = await db.insert(tablesTable).values({ ...parsed.data, tableNumber, qrCode }).returning();
  await normalizeZoneTableNumbers(table.zone);
  res.status(201).json(GetTableResponse.parse(toIsoTable(table)));
});

router.get(
  "/tables/merge-groups",
  requireRoles(["waiter", "cashier", "cleaner", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
    const groups = status
      ? await db
          .select()
          .from(tableMergeGroupsTable)
          .where(eq(tableMergeGroupsTable.status, status))
          .orderBy(tableMergeGroupsTable.createdAt)
      : await db.select().from(tableMergeGroupsTable).orderBy(tableMergeGroupsTable.createdAt);

    const tableIds = [...new Set(groups.flatMap((group) => parseMergedTableIds(group.mergedTableIds)))];
    const tables = tableIds.length > 0
      ? await db
          .select({
            id: tablesTable.id,
            tableNumber: tablesTable.tableNumber,
          })
          .from(tablesTable)
          .where(inArray(tablesTable.id, tableIds))
      : [];
    const tableNumberById = new Map(tables.map((row) => [row.id, row.tableNumber]));

    res.json(
      groups.map((group) => {
        const mergedIds = parseMergedTableIds(group.mergedTableIds);
        return {
          id: group.id,
          zone: group.zone,
          anchorTableId: group.anchorTableId,
          tableIds: mergedIds,
          tableNumbers: mergedIds.map((tableId) => tableNumberById.get(tableId)).filter(Boolean),
          status: group.status,
          createdByStaffId: group.createdByStaffId,
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
        };
      }),
    );
  },
);

router.post(
  "/tables/merge",
  requireRoles(["waiter", "cashier", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as MergeTablesPayload;
    const tableIds = parseIdArray(body.tableIds);
    const requestedAnchorId = parseInteger(body.anchorTableId);
    const staffId = parseInteger(body.staffId) ?? req.auth?.staffId ?? null;

    if (tableIds.length < 2) {
      res.status(400).json({ error: "At least 2 tables are required for merge." });
      return;
    }

    const anchorTableId = requestedAnchorId && tableIds.includes(requestedAnchorId) ? requestedAnchorId : tableIds[0];
    if (!anchorTableId) {
      res.status(400).json({ error: "Invalid anchor table id." });
      return;
    }

    try {
      const result = await db.transaction(async (tx) => {
        const tables = await tx.select().from(tablesTable).where(inArray(tablesTable.id, tableIds));
        if (tables.length !== tableIds.length) {
          const error = new Error("Some tables were not found.") as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        const zones = [...new Set(tables.map((table) => table.zone))];
        if (zones.length !== 1) {
          const error = new Error("All merged tables must belong to the same room/zone.") as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }

        const anchorTable = tables.find((table) => table.id === anchorTableId);
        if (!anchorTable) {
          const error = new Error("Anchor table not found in merge selection.") as Error & { statusCode?: number };
          error.statusCode = 400;
          throw error;
        }

        for (const table of tables) {
          if (table.status !== "Active") {
            const error = new Error(`Table ${table.tableNumber} is not in active service state.`) as Error & { statusCode?: number };
            error.statusCode = 409;
            throw error;
          }
          if (table.currentOrderId) {
            const [linkedOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.id, table.currentOrderId));
            const blocked = linkedOrder && (linkedOrder.status === "open" || linkedOrder.status === "ready_to_pay");
            if (blocked) {
              const error = new Error(`Table ${table.tableNumber} already has an active order.`) as Error & { statusCode?: number };
              error.statusCode = 409;
              throw error;
            }
          }
          if (table.mergedGroupId) {
            const error = new Error(`Table ${table.tableNumber} is already in a merged group.`) as Error & { statusCode?: number };
            error.statusCode = 409;
            throw error;
          }
          if (table.occupancyStatus !== "available") {
            const error = new Error(`Table ${table.tableNumber} must be available before merge.`) as Error & { statusCode?: number };
            error.statusCode = 409;
            throw error;
          }
          const distance = computeDistance(table, anchorTable);
          if (distance > 170) {
            const error = new Error(`Table ${table.tableNumber} is too far from anchor table for merge.`) as Error & { statusCode?: number };
            error.statusCode = 409;
            throw error;
          }
        }

        const orderedIds = [...tableIds].sort((a, b) => a - b);
        const [mergeGroup] = await tx
          .insert(tableMergeGroupsTable)
          .values({
            zone: zones[0],
            anchorTableId,
            mergedTableIds: JSON.stringify(orderedIds),
            status: "active",
            createdByStaffId: staffId,
          })
          .returning();

        for (const tableId of orderedIds) {
          await tx
            .update(tablesTable)
            .set({
              mergedGroupId: mergeGroup.id,
              occupancyStatus: "occupied",
            })
            .where(eq(tablesTable.id, tableId));
        }

        await tx.insert(billingAuditLogsTable).values({
          operation: "merge_tables",
          mergeGroupId: mergeGroup.id,
          tableIds: JSON.stringify(orderedIds),
          detail: JSON.stringify({
            anchorTableId,
            zone: zones[0],
          }),
          staffId,
        });

        return mergeGroup;
      });

      res.status(201).json({
        id: result.id,
        zone: result.zone,
        anchorTableId: result.anchorTableId,
        tableIds: parseMergedTableIds(result.mergedTableIds),
        status: result.status,
        createdByStaffId: result.createdByStaffId,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      });
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode ?? 500;
      const message = error instanceof Error ? error.message : "Failed to merge tables.";
      res.status(statusCode).json({ error: message });
    }
  },
);

router.post(
  "/tables/merge-groups/:id/release",
  requireRoles(["waiter", "cashier", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const mergeGroupId = parseId(req.params.id);
    if (!Number.isFinite(mergeGroupId) || mergeGroupId <= 0) {
      res.status(400).json({ error: "Invalid merge group id." });
      return;
    }

    const body = (req.body ?? {}) as ReleaseMergePayload;
    const staffId = parseInteger(body.staffId) ?? req.auth?.staffId ?? null;

    try {
      const released = await db.transaction(async (tx) => {
        const [mergeGroup] = await tx.select().from(tableMergeGroupsTable).where(eq(tableMergeGroupsTable.id, mergeGroupId));
        if (!mergeGroup) {
          const error = new Error("Merge group not found.") as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }
        if (mergeGroup.status !== "active") {
          const error = new Error("Merge group is already released.") as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }

        const tableIds = parseMergedTableIds(mergeGroup.mergedTableIds);
        const tables = tableIds.length > 0
          ? await tx.select().from(tablesTable).where(inArray(tablesTable.id, tableIds))
          : [];

        const activeOrderIds = [...new Set(tables.map((table) => table.currentOrderId).filter((value): value is number => value != null))];
        const activeOrders = activeOrderIds.length > 0
          ? await tx
              .select()
              .from(ordersTable)
              .where(and(inArray(ordersTable.id, activeOrderIds), inArray(ordersTable.status, ["open", "ready_to_pay"])))
          : [];
        if (activeOrders.length > 0) {
          const error = new Error("Cannot release merge group while active orders are still open.") as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }

        await tx.update(tableMergeGroupsTable).set({ status: "released" }).where(eq(tableMergeGroupsTable.id, mergeGroup.id));

        for (const table of tables) {
          const [linkedOrder] = table.currentOrderId
            ? await tx.select().from(ordersTable).where(eq(ordersTable.id, table.currentOrderId))
            : [null];

          const nextOccupancy = linkedOrder?.status === "paid"
            ? "paid"
            : linkedOrder?.status === "cancelled"
              ? "available"
              : table.currentOrderId
                ? "occupied"
                : "available";

          await tx
            .update(tablesTable)
            .set({
              mergedGroupId: null,
              occupancyStatus: nextOccupancy,
            })
            .where(eq(tablesTable.id, table.id));
        }

        await tx.insert(billingAuditLogsTable).values({
          operation: "release_merge",
          mergeGroupId: mergeGroup.id,
          tableIds: JSON.stringify(tableIds),
          detail: JSON.stringify({ released: true }),
          staffId,
        });

        return {
          mergeGroupId: mergeGroup.id,
          releasedTableIds: tableIds,
          status: "released",
        };
      });

      res.json(released);
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode ?? 500;
      const message = error instanceof Error ? error.message : "Failed to release merge group.";
      res.status(statusCode).json({ error: message });
    }
  },
);

router.get(
  "/tables/seat-sessions",
  requireRoles(["waiter", "cashier", "cleaner", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const tableId = parseInteger(req.query.tableId);
    const status = parseSeatSessionStatus(req.query.status);
    const limit = parseInteger(req.query.limit);

    const conditions = [];
    if (tableId && tableId > 0) conditions.push(eq(tableSeatSessionsTable.tableId, tableId));
    if (status) conditions.push(eq(tableSeatSessionsTable.status, status));

    const rows = await (conditions.length > 0
      ? db
          .select()
          .from(tableSeatSessionsTable)
          .where(and(...conditions))
          .orderBy(tableSeatSessionsTable.createdAt)
          .limit(limit && limit > 0 ? Math.min(limit, 500) : 200)
      : db
          .select()
          .from(tableSeatSessionsTable)
          .orderBy(tableSeatSessionsTable.createdAt)
          .limit(limit && limit > 0 ? Math.min(limit, 500) : 200));

    res.json(rows.map((row) => ({
      ...row,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })));
  },
);

router.get(
  "/tables/:id/seat-sessions",
  requireRoles(["waiter", "cashier", "cleaner", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const tableId = parseId(req.params.id);
    if (!Number.isFinite(tableId) || tableId <= 0) {
      res.status(400).json({ error: "Invalid table id." });
      return;
    }

    const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, tableId));
    if (!table) {
      res.status(404).json({ error: "Table not found." });
      return;
    }

    const sessions = await db
      .select()
      .from(tableSeatSessionsTable)
      .where(eq(tableSeatSessionsTable.tableId, table.id))
      .orderBy(tableSeatSessionsTable.openedAt);

    res.json(sessions.map((session) => ({
      ...session,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    })));
  },
);

router.post(
  "/tables/:id/seat-sessions",
  requireRoles(["waiter", "cashier", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const tableId = parseId(req.params.id);
    if (!Number.isFinite(tableId) || tableId <= 0) {
      res.status(400).json({ error: "Invalid table id." });
      return;
    }
    const body = (req.body ?? {}) as CreateSeatSessionPayload;
    const explicitSlotCode = typeof body.slotCode === "string" ? body.slotCode.trim().toUpperCase() : "";
    const groupName = typeof body.groupName === "string" ? body.groupName.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const staffId = parseInteger(body.staffId) ?? req.auth?.staffId ?? null;

    const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, tableId));
    if (!table) {
      res.status(404).json({ error: "Table not found." });
      return;
    }
    if (table.status !== "Active") {
      res.status(409).json({ error: "Seat sessions can only be created for active tables." });
      return;
    }

    const existing = await db
      .select()
      .from(tableSeatSessionsTable)
      .where(eq(tableSeatSessionsTable.tableId, table.id));
    const activeSessions = existing.filter((session) => session.status !== "closed");
    if (activeSessions.length >= 8) {
      res.status(409).json({ error: "Maximum 8 active seat sessions per table." });
      return;
    }

    const slotCode = explicitSlotCode || resolveNextSlotCode(existing.map((session) => session.slotCode));
    const duplicateSlot = activeSessions.some((session) => session.slotCode.toUpperCase() === slotCode.toUpperCase());
    if (duplicateSlot) {
      res.status(409).json({ error: "Seat slot code is already in use for this table." });
      return;
    }

    const [created] = await db
      .insert(tableSeatSessionsTable)
      .values({
        tableId: table.id,
        slotCode,
        groupName: groupName || null,
        status: "active",
        notes: notes || null,
        autoManaged: true,
      })
      .returning();

    await syncTableOccupancyFromSeatSessions(table.id);
    await db.insert(billingAuditLogsTable).values({
      operation: "seat_session_open",
      tableIds: JSON.stringify([table.id]),
      detail: JSON.stringify({
        sessionId: created.id,
        slotCode: created.slotCode,
        groupName: created.groupName,
      }),
      staffId,
    });

    res.status(201).json({
      ...created,
      openedAt: created.openedAt.toISOString(),
      closedAt: created.closedAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  },
);

router.patch(
  "/tables/:id/seat-sessions/:sessionId",
  requireRoles(["waiter", "cashier", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const tableId = parseId(req.params.id);
    const sessionId = parseId(req.params.sessionId);
    if (!Number.isFinite(tableId) || tableId <= 0 || !Number.isFinite(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: "Invalid table/session id." });
      return;
    }

    const body = (req.body ?? {}) as UpdateSeatSessionPayload;
    const [existing] = await db
      .select()
      .from(tableSeatSessionsTable)
      .where(and(eq(tableSeatSessionsTable.id, sessionId), eq(tableSeatSessionsTable.tableId, tableId)));
    if (!existing) {
      res.status(404).json({ error: "Seat session not found." });
      return;
    }

    const status = body.status === undefined ? undefined : parseSeatSessionStatus(body.status);
    if (body.status !== undefined && !status) {
      res.status(400).json({ error: "Invalid seat session status." });
      return;
    }

    const payload: Partial<typeof tableSeatSessionsTable.$inferInsert> = {};
    if (status) payload.status = status;
    if (body.currentOrderId !== undefined) {
      const currentOrderId = parseInteger(body.currentOrderId);
      if (currentOrderId != null && currentOrderId <= 0) {
        res.status(400).json({ error: "currentOrderId must be null or a positive number." });
        return;
      }
      payload.currentOrderId = currentOrderId ?? null;
    }
    if (typeof body.notes === "string") payload.notes = body.notes.trim() || null;
    if (typeof body.groupName === "string") payload.groupName = body.groupName.trim() || null;
    if (status === "closed") {
      payload.closedAt = new Date();
      payload.currentOrderId = payload.currentOrderId ?? null;
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: "At least one field is required." });
      return;
    }

    const [updated] = await db
      .update(tableSeatSessionsTable)
      .set(payload)
      .where(eq(tableSeatSessionsTable.id, existing.id))
      .returning();

    await syncTableOccupancyFromSeatSessions(tableId);
    await db.insert(billingAuditLogsTable).values({
      operation: "seat_session_update",
      tableIds: JSON.stringify([tableId]),
      detail: JSON.stringify({
        sessionId: updated.id,
        status: updated.status,
        currentOrderId: updated.currentOrderId,
      }),
      staffId: req.auth?.staffId ?? null,
    });

    res.json({
      ...updated,
      openedAt: updated.openedAt.toISOString(),
      closedAt: updated.closedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  },
);

router.post(
  "/tables/:id/seat-sessions/:sessionId/mark-clean",
  requireRoles(["cleaner", "waiter", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const tableId = parseId(req.params.id);
    const sessionId = parseId(req.params.sessionId);
    if (!Number.isFinite(tableId) || tableId <= 0 || !Number.isFinite(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: "Invalid table/session id." });
      return;
    }

    const [existing] = await db
      .select()
      .from(tableSeatSessionsTable)
      .where(and(eq(tableSeatSessionsTable.id, sessionId), eq(tableSeatSessionsTable.tableId, tableId)));
    if (!existing) {
      res.status(404).json({ error: "Seat session not found." });
      return;
    }

    const [updated] = await db
      .update(tableSeatSessionsTable)
      .set({
        status: "closed",
        closedAt: new Date(),
        currentOrderId: null,
      })
      .where(eq(tableSeatSessionsTable.id, existing.id))
      .returning();

    await syncTableOccupancyFromSeatSessions(tableId);
    await db.insert(billingAuditLogsTable).values({
      operation: "seat_session_clean",
      tableIds: JSON.stringify([tableId]),
      detail: JSON.stringify({
        sessionId: updated.id,
        slotCode: updated.slotCode,
      }),
      staffId: req.auth?.staffId ?? null,
    });
    res.json({
      ...updated,
      openedAt: updated.openedAt.toISOString(),
      closedAt: updated.closedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  },
);

router.get("/tables/:id", requireAuth, async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const params = GetTableParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  if (!canAccessTable(req, table.id)) { res.status(403).json({ error: "Permission denied." }); return; }
  res.json(GetTableResponse.parse(toIsoTable(table)));
});

router.post("/tables/:id/scan", async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const params = GetTableParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, table.id)) { res.status(403).json({ error: "Permission denied." }); return; }
  if (table.status !== "Active") { res.status(409).json({ error: "This table is currently unavailable." }); return; }

  const [updated] = await db.update(tablesTable).set({ occupancyStatus: "occupied" }).where(eq(tablesTable.id, params.data.id)).returning();
  res.json(GetTableResponse.parse(toIsoTable(updated)));
});

router.patch("/tables/:id", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  await autoCancelExpiredBookings();
  const params = UpdateTableParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [currentTable] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
  if (!currentTable) { res.status(404).json({ error: "Table not found" }); return; }

  const payload = { ...parsed.data };

  if (payload.tableNumber != null) {
    payload.tableNumber = payload.tableNumber.trim();
  }

  if (payload.zone && !(await validateRoomCodeExists(payload.zone))) {
    res.status(400).json({ error: "Room does not exist for this zone code." });
    return;
  }

  if (payload.zone || payload.tableNumber != null) {
    const nextZone = payload.zone ?? currentTable.zone;
    const requested = payload.tableNumber && payload.tableNumber.length > 0
      ? payload.tableNumber
      : currentTable.tableNumber;
    payload.tableNumber = await resolveAutoTableNumber(nextZone, requested, params.data.id);
  }

  if (payload.status && payload.status !== "Active") {
    payload.currentOrderId = null;
    payload.occupancyStatus = payload.occupancyStatus ?? "dirty";
  }

  const nextOccupancy = payload.occupancyStatus;
  if (
    nextOccupancy &&
    (nextOccupancy === "dirty" || nextOccupancy === "available") &&
    ["occupied", "payment_pending", "paid"].includes(currentTable.occupancyStatus)
  ) {
    await markBookingCheckoutForTable(currentTable.id);
  }

  const [table] = await db.update(tablesTable).set(payload).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  if ((payload.zone ?? currentTable.zone) !== currentTable.zone) {
    await normalizeZoneTableNumbers(currentTable.zone);
  }
  await normalizeZoneTableNumbers(payload.zone ?? currentTable.zone);
  res.json(UpdateTableResponse.parse(toIsoTable(table)));
});

router.delete("/tables/:id", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const params = DeleteTableParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [table] = await db.delete(tablesTable).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  await normalizeZoneTableNumbers(table.zone);
  res.sendStatus(204);
});

router.post("/tables/renumber", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as RenumberTablesPayload;
  const zone = typeof body.zone === "string" ? body.zone.trim() : "";

  if (zone) {
    if (!(await validateRoomCodeExists(zone))) {
      res.status(400).json({ error: "Room does not exist for this zone code." });
      return;
    }
    const updated = await normalizeZoneTableNumbers(zone);
    res.json({ updated, zones: [zone] });
    return;
  }

  const all = await db.select({ zone: tablesTable.zone }).from(tablesTable);
  const uniqueZones = [...new Set(all.map((row) => row.zone))].sort();
  let totalUpdated = 0;
  for (const zoneCode of uniqueZones) {
    totalUpdated += await normalizeZoneTableNumbers(zoneCode);
  }
  res.json({ updated: totalUpdated, zones: uniqueZones });
});

export default router;
