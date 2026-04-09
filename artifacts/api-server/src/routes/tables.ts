import { Router, type IRouter } from "express";
import { count, eq } from "drizzle-orm";
import { db, roomsTable, tablesTable } from "@workspace/db";
import { canAccessTable, requireAuth, requireRoles } from "../lib/auth";
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

function getTailNumber(value: string): number | null {
  const match = /(\d+)$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function resolveAutoTableNumber(zoneCode: string, requested: string | null | undefined, excludeId?: number): Promise<string> {
  const prefix = getZonePrefix(zoneCode);
  const requestedNumber = requested ? getTailNumber(requested) : null;

  const rows = await db.select({ id: tablesTable.id, tableNumber: tablesTable.tableNumber }).from(tablesTable);
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

    const movedTables = await db.select().from(tablesTable).where(eq(tablesTable.zone, payload.code));
    for (const moved of movedTables) {
      const nextTableNumber = await resolveAutoTableNumber(payload.code, moved.tableNumber, moved.id);
      if (nextTableNumber !== moved.tableNumber) {
        await db
          .update(tablesTable)
          .set({ tableNumber: nextTableNumber })
          .where(eq(tablesTable.id, moved.id));
      }
    }
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
  res.status(201).json(GetTableResponse.parse(toIsoTable(table)));
});

router.get("/tables/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTableParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  if (!canAccessTable(req, table.id)) { res.status(403).json({ error: "Permission denied." }); return; }
  res.json(GetTableResponse.parse(toIsoTable(table)));
});

router.post("/tables/:id/scan", async (req, res): Promise<void> => {
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

  const [table] = await db.update(tablesTable).set(payload).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(UpdateTableResponse.parse(toIsoTable(table)));
});

router.delete("/tables/:id", requireRoles(ADMIN_ROLES), async (req, res): Promise<void> => {
  const params = DeleteTableParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [table] = await db.delete(tablesTable).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.sendStatus(204);
});

export default router;
