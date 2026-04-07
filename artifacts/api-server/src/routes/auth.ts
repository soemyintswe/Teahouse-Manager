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

const STAFF_ALLOWED_ROLES: AppRole[] = ["waiter", "kitchen", "cashier", "supervisor", "manager", "owner"];

function normalizeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePin(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

router.post("/auth/staff-login", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as StaffLoginBody;
  const identifier = normalizeIdentifier(body.identifier);
  const pin = normalizePin(body.pin);

  if (!identifier || !pin) {
    res.status(400).json({ error: "identifier and pin are required." });
    return;
  }

  const members = await db.select().from(staffTable).where(eq(staffTable.active, "true"));
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
  const tableNumber =
    typeof body.tableNumber === "string" && body.tableNumber.trim().length > 0
      ? body.tableNumber.trim()
      : null;

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
    res.status(409).json({ error: "This table is currently unavailable." });
    return;
  }

  if (table.occupancyStatus === "available") {
    await db
      .update(tablesTable)
      .set({ occupancyStatus: "occupied" })
      .where(eq(tablesTable.id, table.id));
  }

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
