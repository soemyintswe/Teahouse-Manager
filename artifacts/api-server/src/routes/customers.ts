import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, customerAddressesTable, customerPhonesTable, customersTable, ordersTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../lib/auth";
import { isSchemaDriftError } from "../lib/db-errors";

const router: IRouter = Router();

type CustomerStatusActionBody = {
  action?: unknown;
};

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function createTemporaryPassword(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TH-${random}`;
}

function normalizeFilter(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length > 0 ? text.toLowerCase() : null;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  return new Date(0).toISOString();
}

router.get("/customers/me", requireAuth, async (req, res): Promise<void> => {
  if (req.auth?.role !== "customer" || !req.auth.customerId) {
    res.status(403).json({ error: "Only customer account can access this endpoint." });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, req.auth.customerId));
  if (!customer) {
    res.status(404).json({ error: "Customer account not found." });
    return;
  }

  const phones = await db.select().from(customerPhonesTable).where(eq(customerPhonesTable.customerId, customer.id));
  const addresses = await db.select().from(customerAddressesTable).where(eq(customerAddressesTable.customerId, customer.id));

  res.json({
    id: customer.id,
    fullName: customer.fullName,
    status: customer.status,
    mustChangePassword: customer.mustChangePassword,
    phones: phones
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((phone) => phone.phone),
    addresses: addresses.map((address) => ({
      id: address.id,
      unitNo: address.unitNo,
      street: address.street,
      ward: address.ward,
      township: address.township,
      region: address.region,
      mapLink: address.mapLink,
      isDefault: address.isDefault,
    })),
  });
});

router.get("/customers", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  try {
    const statusFilter = normalizeFilter(req.query.status);
    const regionFilter = normalizeFilter(req.query.region);
    const townshipFilter = normalizeFilter(req.query.township);
    const streetFilter = normalizeFilter(req.query.street);

    const allCustomers = await db.select().from(customersTable).orderBy(desc(customersTable.createdAt));
    const customerIds = allCustomers.map((customer) => customer.id);
    const phones = customerIds.length > 0
      ? await db.select().from(customerPhonesTable).where(inArray(customerPhonesTable.customerId, customerIds))
      : [];
    const addresses = customerIds.length > 0
      ? await db.select().from(customerAddressesTable).where(inArray(customerAddressesTable.customerId, customerIds))
      : [];
    const deliveryOrders = customerIds.length > 0
      ? await db
          .select()
          .from(ordersTable)
          .where(and(inArray(ordersTable.customerId, customerIds), eq(ordersTable.orderSource, "delivery")))
      : [];

    const phonesByCustomer = new Map<number, string[]>();
    for (const row of phones) {
      const list = phonesByCustomer.get(row.customerId) ?? [];
      list.push(row.phone);
      phonesByCustomer.set(row.customerId, list);
    }

    const addressByCustomer = new Map<number, typeof addresses[number]>();
    for (const row of addresses) {
      const existing = addressByCustomer.get(row.customerId);
      if (!existing || row.isDefault) {
        addressByCustomer.set(row.customerId, row);
      }
    }

    const ordersByCustomer = new Map<number, typeof deliveryOrders>();
    for (const row of deliveryOrders) {
      const customerId = row.customerId ?? 0;
      const list = ordersByCustomer.get(customerId) ?? [];
      list.push(row);
      ordersByCustomer.set(customerId, list);
    }

    const result = allCustomers
      .map((customer) => {
        const defaultAddress = addressByCustomer.get(customer.id);
        const customerOrders = ordersByCustomer.get(customer.id) ?? [];
        const latestOrder = [...customerOrders].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
        return {
          id: customer.id,
          fullName: customer.fullName,
          status: customer.status,
          mustChangePassword: customer.mustChangePassword,
          createdAt: toIsoString(customer.createdAt),
          phones: (phonesByCustomer.get(customer.id) ?? []).sort(),
          address: defaultAddress
            ? {
                unitNo: defaultAddress.unitNo,
                street: defaultAddress.street,
                ward: defaultAddress.ward,
                township: defaultAddress.township,
                region: defaultAddress.region,
                mapLink: defaultAddress.mapLink,
              }
            : null,
          totalDeliveryOrders: customerOrders.length,
          latestDeliveryStatus: latestOrder?.deliveryStatus ?? null,
        };
      })
      .filter((row) => (statusFilter ? row.status.toLowerCase() === statusFilter : true))
      .filter((row) => (regionFilter ? (row.address?.region ?? "").toLowerCase().includes(regionFilter) : true))
      .filter((row) => (townshipFilter ? (row.address?.township ?? "").toLowerCase().includes(townshipFilter) : true))
      .filter((row) => (streetFilter ? (row.address?.street ?? "").toLowerCase().includes(streetFilter) : true));

    res.json(result);
  } catch (error) {
    if (isSchemaDriftError(error)) {
      res.json([]);
      return;
    }
    res.status(500).json({ error: "Failed to load customer accounts." });
  }
});

router.patch("/customers/:id/status", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  const id = Number.parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid customer id." });
    return;
  }

  const body = (req.body ?? {}) as CustomerStatusActionBody;
  const action = normalizeText(body.action).toLowerCase();
  if (!["approve", "deny", "terminate"].includes(action)) {
    res.status(400).json({ error: "action must be approve, deny, or terminate." });
    return;
  }

  const nextStatus = action === "approve" ? "approved" : action === "deny" ? "denied" : "terminated";
  const [updated] = await db
    .update(customersTable)
    .set({ status: nextStatus })
    .where(eq(customersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Customer not found." });
    return;
  }

  res.json({
    id: updated.id,
    status: updated.status,
    fullName: updated.fullName,
  });
});

router.post("/customers/:id/reset-password", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  const id = Number.parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid customer id." });
    return;
  }

  const temporaryPassword = createTemporaryPassword();
  const [updated] = await db
    .update(customersTable)
    .set({
      password: temporaryPassword,
      mustChangePassword: true,
      status: "approved",
    })
    .where(eq(customersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Customer not found." });
    return;
  }

  res.json({
    id: updated.id,
    fullName: updated.fullName,
    temporaryPassword,
    mustChangePassword: updated.mustChangePassword,
  });
});

export default router;
