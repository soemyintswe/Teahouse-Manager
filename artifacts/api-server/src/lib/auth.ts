import type { NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

export const APP_ROLES = [
  "guest",
  "waiter",
  "kitchen",
  "cashier",
  "cleaner",
  "room_supervisor",
  "supervisor",
  "manager",
  "owner",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AuthPrincipal = {
  role: AppRole;
  exp: number;
  name?: string;
  staffId?: number;
  tableId?: number;
  tableNumber?: string;
};

type AuthTokenPayload = {
  v: 1;
  role: AppRole;
  exp: number;
  name?: string;
  staffId?: number;
  tableId?: number;
  tableNumber?: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal | null;
    }
  }
}

const AUTH_SECRET = process.env.AUTH_SECRET?.trim() || "change-this-auth-secret";
const TOKEN_PREFIX = "ths_";

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const withPadding = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(withPadding, "base64");
}

function signPayloadSegment(segment: string): string {
  return toBase64Url(createHmac("sha256", AUTH_SECRET).update(segment).digest());
}

export function issueAuthToken(principal: Omit<AuthPrincipal, "exp"> & { expiresInSec?: number }): string {
  const expiresInSec = principal.expiresInSec ?? 60 * 60 * 24 * 7;
  const payload: AuthTokenPayload = {
    v: 1,
    role: principal.role,
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
    name: principal.name,
    staffId: principal.staffId,
    tableId: principal.tableId,
    tableNumber: principal.tableNumber,
  };

  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signatureSegment = signPayloadSegment(payloadSegment);
  return `${TOKEN_PREFIX}${payloadSegment}.${signatureSegment}`;
}

export function verifyAuthToken(token: string): AuthPrincipal | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const raw = token.slice(TOKEN_PREFIX.length);
  const [payloadSegment, signatureSegment] = raw.split(".");
  if (!payloadSegment || !signatureSegment) return null;

  const expectedSignature = signPayloadSegment(payloadSegment);
  const received = Buffer.from(signatureSegment);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payloadSegment).toString("utf8")) as Partial<AuthTokenPayload>;
    if (parsed.v !== 1) return null;
    if (!parsed.role || !APP_ROLES.includes(parsed.role as AppRole)) return null;
    if (!parsed.exp || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      role: parsed.role as AppRole,
      exp: parsed.exp,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      staffId: typeof parsed.staffId === "number" ? parsed.staffId : undefined,
      tableId: typeof parsed.tableId === "number" ? parsed.tableId : undefined,
      tableNumber: typeof parsed.tableNumber === "string" ? parsed.tableNumber : undefined,
    };
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  req.auth = token ? verifyAuthToken(token) : null;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

export function requireRoles(roles: readonly AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Permission denied." });
      return;
    }
    next();
  };
}

export function isStaffRole(role: AppRole): boolean {
  return role !== "guest";
}

export function canAccessTable(req: Request, tableId: number): boolean {
  if (!req.auth) return false;
  if (req.auth.role !== "guest") return true;
  return req.auth.tableId === tableId;
}
