import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, staffTable, tablesTable } from "@workspace/db";
import { APP_ROLES, issueAuthToken, requireAuth, type AppRole, type AuthPrincipal, isStaffRole } from "../lib/auth";

const router: IRouter = Router();

type StaffLoginBody = {
  identifier?: unknown;
  pin?: unknown;
};

type GuestLoginBody = {
  tableId?: unknown;
  tableNumber?: unknown;
};

const STAFF_ALLOWED_ROLES: AppRole[] = [
  "waiter",
  "kitchen",
  "cashier",
  "cleaner",
  "room_supervisor",
  "supervisor",
  "manager",
  "owner",
];
const DEFAULT_BOOTSTRAP_STAFF = [
  { name: "Owner", role: "owner", phone: "09990000001", email: "owner@teahouse.local", pin: "1111" },
  { name: "Manager", role: "manager", phone: "09990000002", email: "manager@teahouse.local", pin: "2222" },
  { name: "Supervisor", role: "supervisor", phone: "09990000003", email: "supervisor@teahouse.local", pin: "3333" },
  { name: "Cashier", role: "cashier", phone: "09990000004", email: "cashier@teahouse.local", pin: "4444" },
  { name: "Kitchen", role: "kitchen", phone: "09990000005", email: "kitchen@teahouse.local", pin: "5555" },
  { name: "Waiter", role: "waiter", phone: "09990000006", email: "waiter@teahouse.local", pin: "6666" },
  { name: "Cleaner", role: "cleaner", phone: "09990000007", email: "cleaner@teahouse.local", pin: "7777" },
  { name: "Room Supervisor", role: "room_supervisor", phone: "09990000008", email: "room-supervisor@teahouse.local", pin: "8888" },
] as const;

function normalizeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePin(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTableNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function sanitizePrincipal(principal: AuthPrincipal) {
  return {
    role: principal.role,
    name: principal.name,
    staffId: principal.staffId ?? null,
    tableId: principal.tableId ?? null,
    tableNumber: principal.tableNumber ?? null,
    exp: principal.exp,
  };
}

function isStaffActive(value: string | null | undefined): boolean {
  const normalized = (value ?? "true").trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "inactive" && normalized !== "no";
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

async function getActiveStaffMembers(): Promise<Array<typeof staffTable.$inferSelect>> {
  let members = await db.select().from(staffTable);
  let activeMembers = members.filter((member) => isStaffActive(member.active));
  if (activeMembers.length > 0) return activeMembers;

  for (const seed of DEFAULT_BOOTSTRAP_STAFF) {
    const existing = members.find((member) => {
      return (
        normalizedText(member.name) === normalizedText(seed.name) ||
        normalizedText(member.email) === normalizedText(seed.email) ||
        normalizedText(member.phone) === normalizedText(seed.phone)
      );
    });

    if (existing) {
      await db
        .update(staffTable)
        .set({
          name: seed.name,
          role: seed.role,
          phone: seed.phone,
          email: seed.email,
          pin: seed.pin,
          active: "true",
        })
        .where(eq(staffTable.id, existing.id));
    } else {
      await db.insert(staffTable).values({
        name: seed.name,
        role: seed.role,
        phone: seed.phone,
        email: seed.email,
        pin: seed.pin,
        active: "true",
      });
    }
  }

  members = await db.select().from(staffTable);
  activeMembers = members.filter((member) => isStaffActive(member.active));
  return activeMembers;
}

router.post("/auth/staff-login", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as StaffLoginBody;
  const identifier = normalizeIdentifier(body.identifier);
  const pin = normalizePin(body.pin);

  if (!identifier || !pin) {
    res.status(400).json({ error: "identifier and pin are required." });
    return;
  }

  const members = await getActiveStaffMembers();
  const staff = members.find((member) => {
    const byName = member.name.trim().toLowerCase() === identifier;
    const byEmail = member.email?.trim().toLowerCase() === identifier;
    const byPhone = member.phone?.trim().toLowerCase() === identifier;
    return byName || byEmail || byPhone;
  });

  if (!staff || !staff.pin || staff.pin !== pin) {
    res.status(401).json({ error: "Invalid login credentials." });
    return;
  }

  const normalizedRole = staff.role.trim().toLowerCase() as AppRole;
  const role = APP_ROLES.includes(normalizedRole) && isStaffRole(normalizedRole) ? normalizedRole : "waiter";

  const token = issueAuthToken({
    role,
    staffId: staff.id,
    name: staff.name,
    expiresInSec: 60 * 60 * 8,
  });

  const principal = sanitizePrincipal({
    role,
    staffId: staff.id,
    name: staff.name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  });

  res.json({
    token,
    user: principal,
    roles: STAFF_ALLOWED_ROLES,
  });
});

router.post("/auth/guest-login", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as GuestLoginBody;
  const tableId =
    typeof body.tableId === "number" && Number.isFinite(body.tableId) && body.tableId > 0
      ? Math.floor(body.tableId)
      : null;
  const normalizedTableNumber = normalizeTableNumber(body.tableNumber);
  const tableNumber = normalizedTableNumber.length > 0 ? normalizedTableNumber : null;

  if (!tableId && !tableNumber) {
    res.status(400).json({ error: "tableId or tableNumber is required." });
    return;
  }

  const tableCandidates = tableId
    ? await db.select().from(tablesTable).where(eq(tablesTable.id, tableId))
    : await db.select().from(tablesTable).where(eq(tablesTable.tableNumber, tableNumber as string));

  const table = tableCandidates[0];
  if (!table) {
    res.status(404).json({ error: "Table not found." });
    return;
  }
  if (table.status !== "Active") {
    res.status(409).json({ error: "This table is currently unavailable (maintenance mode)." });
    return;
  }
  if (table.isBooked) {
    res.status(409).json({ error: "This table is already reserved." });
    return;
  }
  if (table.occupancyStatus === "occupied") {
    res.status(409).json({ error: "This table is currently occupied." });
    return;
  }
  if (table.occupancyStatus === "payment_pending") {
    res.status(409).json({ error: "This table is waiting for payment." });
    return;
  }
  if (table.occupancyStatus === "paid") {
    res.status(409).json({ error: "This table is still in use after payment." });
    return;
  }
  if (table.occupancyStatus === "dirty") {
    res.status(409).json({ error: "This table is waiting for cleaning." });
    return;
  }
  if (table.occupancyStatus !== "available") {
    res.status(409).json({ error: "This table is currently unavailable." });
    return;
  }

  await db
    .update(tablesTable)
    .set({ occupancyStatus: "occupied" })
    .where(eq(tablesTable.id, table.id));

  const token = issueAuthToken({
    role: "guest",
    tableId: table.id,
    tableNumber: table.tableNumber,
    name: `Guest-${table.tableNumber}`,
    expiresInSec: 60 * 60 * 6,
  });

  const principal = sanitizePrincipal({
    role: "guest",
    tableId: table.id,
    tableNumber: table.tableNumber,
    name: `Guest-${table.tableNumber}`,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
  });

  res.json({ token, user: principal });
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json({ user: sanitizePrincipal(req.auth as AuthPrincipal) });
});

router.get("/auth/roles", (_req, res): void => {
  res.json({ roles: STAFF_ALLOWED_ROLES });
});

export default router;
