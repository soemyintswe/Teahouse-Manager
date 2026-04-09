import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  menuItemsTable,
  tablesTable,
  settingsTable,
  customerAddressesTable,
  customerPhonesTable,
  customersTable,
} from "@workspace/db";
import { canAccessTable, requireAuth, requireRoles } from "../lib/auth";
import {
  ListOrdersQueryParams,
  ListOrdersResponse,
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderParams,
  UpdateOrderBody,
  UpdateOrderResponse,
  AddOrderItemParams,
  AddOrderItemBody,
  UpdateOrderItemParams,
  UpdateOrderItemBody,
  UpdateOrderItemResponse,
  RemoveOrderItemParams,
} from "@workspace/api-zod";
import { isDatabaseError } from "../lib/db-errors";

const router: IRouter = Router();
const MODIFIABLE_ORDER_STATUSES = ["open", "ready_to_pay"] as const;
const DELIVERY_PAYMENT_METHODS = ["cash", "wallet"] as const;
const DELIVERY_WALLET_TYPES = ["wave_pay", "kbz_pay", "aya_pay", "cb_pay"] as const;

type DeliveryPaymentMethod = (typeof DELIVERY_PAYMENT_METHODS)[number];
type DeliveryWalletType = (typeof DELIVERY_WALLET_TYPES)[number];

type DeliveryOrderItemInput = {
  menuItemId: number;
  quantity: number;
};

type DeliveryOrderRequestBody = {
  notes?: unknown;
  paymentMethod?: unknown;
  walletType?: unknown;
  items?: unknown;
};

const DELIVERY_STATUSES = ["received", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

type UpdateDeliveryStatusBody = {
  status?: unknown;
};

function isBillableOrderItem(item: typeof orderItemsTable.$inferSelect): boolean {
  return (item.kitchenStatus ?? "").trim().toLowerCase() !== "cancelled";
}

function isOrderModifiable(status: string): boolean {
  return MODIFIABLE_ORDER_STATUSES.includes(status as (typeof MODIFIABLE_ORDER_STATUSES)[number]);
}

function normalizeCancelNote(reason: string, actor: string): string {
  const trimmedReason = reason.trim();
  const trimmedActor = actor.trim() || "staff";
  if (!trimmedReason) return `[Cancelled by ${trimmedActor}]`;
  return `[Cancelled by ${trimmedActor}] ${trimmedReason}`;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDeliveryPaymentMethod(value: unknown): DeliveryPaymentMethod {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((DELIVERY_PAYMENT_METHODS as readonly string[]).includes(normalized)) {
    return normalized as DeliveryPaymentMethod;
  }
  return "cash";
}

function parseDeliveryWalletType(value: unknown): DeliveryWalletType | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((DELIVERY_WALLET_TYPES as readonly string[]).includes(normalized)) {
    return normalized as DeliveryWalletType;
  }
  return null;
}

function parseDeliveryItems(value: unknown): DeliveryOrderItemInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const menuItemId = Number(raw.menuItemId);
      const quantity = Number(raw.quantity);
      if (!Number.isFinite(menuItemId) || menuItemId <= 0) return null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        menuItemId: Math.floor(menuItemId),
        quantity: Math.floor(quantity),
      };
    })
    .filter((entry): entry is DeliveryOrderItemInput => Boolean(entry));
}

function parseDeliveryStatus(value: unknown): DeliveryStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((DELIVERY_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as DeliveryStatus;
  }
  return null;
}

function formatOrder(order: typeof ordersTable.$inferSelect) {
  return {
    ...order,
    subtotal: order.subtotal.toString(),
    airconFee: order.airconFee.toString(),
    taxAmount: order.taxAmount.toString(),
    totalAmount: order.totalAmount.toString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function formatOrderItem(item: typeof orderItemsTable.$inferSelect) {
  return {
    ...item,
    unitPrice: item.unitPrice.toString(),
    createdAt: item.createdAt.toISOString(),
  };
}

async function recalcOrder(orderId: number, executor: any = db): Promise<void> {
  const items = await executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const [order] = await executor.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return;

  const [settings] = await executor.select().from(settingsTable).limit(1);
  const taxRate = settings ? parseFloat(settings.taxRate.toString()) / 100 : 0.05;
  const airconFeeBase = settings ? parseFloat(settings.airconFee.toString()) : 500;

  const subtotal = items
    .filter(isBillableOrderItem)
    .reduce(
    (sum: number, item: typeof orderItemsTable.$inferSelect) =>
      sum + parseFloat(item.unitPrice.toString()) * item.quantity,
    0,
  );
  const [table] = await executor.select().from(tablesTable).where(eq(tablesTable.id, order.tableId));
  const airconFee = (table?.zone === "aircon") ? airconFeeBase : 0;
  const taxAmount = (subtotal + airconFee) * taxRate;
  const totalAmount = subtotal + airconFee + taxAmount;

  await executor.update(ordersTable).set({
    subtotal: subtotal.toFixed(2),
    airconFee: airconFee.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  }).where(eq(ordersTable.id, orderId));
}

async function syncOrderAfterItemChange(orderId: number, executor: any = db): Promise<void> {
  const [order] = await executor.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return;

  await recalcOrder(orderId, executor);

  if (order.status === "paid") return;

  const items = await executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const hasBillableItems = items.some(isBillableOrderItem);

  if (!hasBillableItems) {
    await executor
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, orderId));
    if (order.tableId > 0) {
      await executor
        .update(tablesTable)
        .set({ occupancyStatus: "available", currentOrderId: null })
        .where(eq(tablesTable.id, order.tableId));
    }
  }
}

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const qp = ListOrdersQueryParams.safeParse(req.query);
  if (req.auth?.role === "guest") {
    const requestedTableId = qp.success ? qp.data.tableId : undefined;
    if (requestedTableId == null || !canAccessTable(req, requestedTableId)) {
      res.status(403).json({ error: "Permission denied." });
      return;
    }
  }

  const conditions: any[] = [];
  if (req.auth?.role === "customer" && req.auth.customerId) {
    conditions.push(eq(ordersTable.customerId, req.auth.customerId));
  }
  if (qp.success && qp.data.status) conditions.push(eq(ordersTable.status, qp.data.status));
  if (qp.success && qp.data.tableId != null) conditions.push(eq(ordersTable.tableId, qp.data.tableId));
  if (qp.success && qp.data.date) {
    conditions.push(sql`DATE(${ordersTable.createdAt}) = ${qp.data.date}`);
  }

  let orders;
  if (conditions.length > 0) {
    orders = await db.select().from(ordersTable).where(and(...conditions)).orderBy(sql`${ordersTable.createdAt} desc`);
  } else {
    orders = await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} desc`);
  }
  res.json(ListOrdersResponse.parse(orders.map(formatOrder)));
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (req.auth?.role === "customer") {
    res.status(403).json({ error: "Customer account cannot create dine-in table orders." });
    return;
  }
  if (req.auth?.role === "guest" && !canAccessTable(req, parsed.data.tableId)) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }

  try {
    const createdOrderId = await db.transaction(async (tx) => {
      const [table] = await tx.select().from(tablesTable).where(eq(tablesTable.id, parsed.data.tableId));
      if (!table) {
        const error = new Error("Table not found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      if (table.status !== "Active") {
        const error = new Error("This table is currently unavailable.") as Error & { statusCode?: number };
        error.statusCode = 409;
        throw error;
      }

      if (["payment_pending", "paid", "dirty"].includes(table.occupancyStatus)) {
        const error = new Error("This table is currently unavailable.") as Error & { statusCode?: number };
        error.statusCode = 409;
        throw error;
      }

      if (table.currentOrderId) {
        const [activeOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.id, table.currentOrderId));
        if (activeOrder && (activeOrder.status === "open" || activeOrder.status === "ready_to_pay")) {
          const error = new Error(`Table already has active order #${activeOrder.id}`) as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }
      }

      const [order] = await tx.insert(ordersTable).values({
        tableId: parsed.data.tableId,
        tableNumber: table.tableNumber,
        orderSource: "dine_in",
        deliveryStatus: null,
        notes: parsed.data.notes ?? null,
        staffId: parsed.data.staffId ?? null,
      }).returning();

      await tx.update(tablesTable)
        .set({ occupancyStatus: "occupied", currentOrderId: order.id })
        .where(eq(tablesTable.id, parsed.data.tableId));

      if (parsed.data.items && parsed.data.items.length > 0) {
        for (const item of parsed.data.items) {
          const [menuItem] = await tx.select().from(menuItemsTable).where(eq(menuItemsTable.id, item.menuItemId));
          if (menuItem) {
            await tx.insert(orderItemsTable).values({
              orderId: order.id,
              menuItemId: item.menuItemId,
              menuItemName: menuItem.name,
              quantity: item.quantity,
              unitPrice: menuItem.price,
              customizations: item.customizations ?? null,
              notes: item.notes ?? null,
            });
          }
        }
        await recalcOrder(order.id, tx);
      }

      return order.id;
    });

    const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, createdOrderId));
    if (!updatedOrder) {
      res.status(500).json({ error: "Failed to load created order" });
      return;
    }

    res.status(201).json(formatOrder(updatedOrder));
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 500;
    const message =
      statusCode >= 500 && isDatabaseError(error)
        ? "Failed to create order due to database update. Please retry shortly."
        : error instanceof Error
          ? error.message
          : "Failed to create order";
    res.status(statusCode).json({ error: message });
  }
});

router.post("/orders/delivery-request", requireAuth, async (req, res): Promise<void> => {
  if (req.auth?.role !== "customer" || !req.auth.customerId) {
    res.status(403).json({ error: "Customer login is required for delivery order." });
    return;
  }

  const body = (req.body ?? {}) as DeliveryOrderRequestBody;
  const notes = normalizeText(body.notes);
  const items = parseDeliveryItems(body.items);
  const paymentMethod = parseDeliveryPaymentMethod(body.paymentMethod);
  const walletType = parseDeliveryWalletType(body.walletType);

  if (items.length === 0) {
    res.status(400).json({ error: "At least one menu item is required." });
    return;
  }
  if (paymentMethod === "wallet" && !walletType) {
    res.status(400).json({ error: "walletType is required when paymentMethod is wallet." });
    return;
  }

  try {
    const createdOrderId = await db.transaction(async (tx) => {
      const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, req.auth!.customerId!));
      if (!customer) {
        const error = new Error("Customer account not found.") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }
      if (customer.status !== "approved") {
        const error = new Error("Customer account is not approved.") as Error & { statusCode?: number };
        error.statusCode = 403;
        throw error;
      }

      const phones = await tx
        .select()
        .from(customerPhonesTable)
        .where(eq(customerPhonesTable.customerId, customer.id));
      const sortedPhones = phones.sort((a, b) => a.sortOrder - b.sortOrder).map((row) => row.phone);
      if (sortedPhones.length === 0) {
        const error = new Error("Customer phone number is missing.") as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }

      const addresses = await tx
        .select()
        .from(customerAddressesTable)
        .where(eq(customerAddressesTable.customerId, customer.id));
      const defaultAddress = addresses.find((row) => row.isDefault) ?? addresses[0];
      if (!defaultAddress) {
        const error = new Error("Customer delivery address is missing.") as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }

      const [settings] = await tx.select().from(settingsTable).limit(1);
      const taxRate = settings ? parseFloat(settings.taxRate.toString()) / 100 : 0.05;
      const paymentLabel = paymentMethod === "wallet" ? `wallet:${walletType}` : "cash";

      const menuIds = [...new Set(items.map((item) => item.menuItemId))];
      const menuRows = await tx.select().from(menuItemsTable).where(inArray(menuItemsTable.id, menuIds));
      const menuById = new Map(menuRows.map((menu) => [menu.id, menu]));

      const preparedItems = items.map((item) => {
        const menu = menuById.get(item.menuItemId);
        if (!menu) {
          const error = new Error(`Menu item #${item.menuItemId} not found.`) as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }
        return { menu, quantity: item.quantity };
      });

      const subtotal = preparedItems.reduce(
        (sum, entry) => sum + parseFloat(entry.menu.price.toString()) * entry.quantity,
        0,
      );
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;

      const [order] = await tx
        .insert(ordersTable)
        .values({
          tableId: 0,
          tableNumber: "DELIVERY",
          orderSource: "delivery",
          status: paymentMethod === "wallet" ? "ready_to_pay" : "open",
          subtotal: subtotal.toFixed(2),
          airconFee: "0.00",
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          paymentMethod: paymentLabel,
          customerId: customer.id,
          customerName: customer.fullName,
          customerPhones: JSON.stringify(sortedPhones),
          deliveryUnitNo: defaultAddress.unitNo,
          deliveryStreet: defaultAddress.street,
          deliveryWard: defaultAddress.ward,
          deliveryTownship: defaultAddress.township,
          deliveryRegion: defaultAddress.region,
          deliveryMapLink: defaultAddress.mapLink,
          deliveryStatus: "received",
          notes: notes || null,
          staffId: null,
        })
        .returning();

      for (const entry of preparedItems) {
        await tx.insert(orderItemsTable).values({
          orderId: order.id,
          menuItemId: entry.menu.id,
          menuItemName: entry.menu.name,
          quantity: entry.quantity,
          unitPrice: entry.menu.price,
          customizations: null,
          notes: null,
        });
      }

      return order.id;
    });

    const [createdOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, createdOrderId));
    if (!createdOrder) {
      res.status(500).json({ error: "Failed to create delivery order." });
      return;
    }

    res.status(201).json({
      orderId: createdOrder.id,
      status: createdOrder.status,
      paymentMethod: createdOrder.paymentMethod,
      totalAmount: createdOrder.totalAmount.toString(),
      message: "Delivery order created.",
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 500;
    const message =
      statusCode >= 500 && isDatabaseError(error)
        ? "Failed to create delivery order due to database update. Please retry shortly."
        : error instanceof Error
          ? error.message
          : "Failed to create delivery order.";
    res.status(statusCode).json({ error: message });
  }
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  res.json(GetOrderResponse.parse({
    ...formatOrder(order),
    items: items.map(formatOrderItem),
  }));
});

router.patch("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [targetOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!targetOrder) { res.status(404).json({ error: "Order not found" }); return; }
  if (req.auth?.role === "guest") {
    if (!canAccessTable(req, targetOrder.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
    const nextStatus = parsed.data.status;
    if (nextStatus && nextStatus !== "ready_to_pay") {
      res.status(403).json({ error: "Guest can only request bill/payment." });
      return;
    }
  }
  if (req.auth?.role === "customer" && req.auth.customerId !== targetOrder.customerId) {
    res.status(403).json({ error: "Permission denied." });
    return;
  }

  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // Paid table should stay occupied until manual checkout.
  if (order.tableId > 0 && parsed.data.status === "paid") {
    await db
      .update(tablesTable)
      .set({ occupancyStatus: "paid", currentOrderId: order.id })
      .where(eq(tablesTable.id, order.tableId));
  }

  // Cancelled order can free table immediately.
  if (order.tableId > 0 && parsed.data.status === "cancelled") {
    await db
      .update(tablesTable)
      .set({ occupancyStatus: "available", currentOrderId: null })
      .where(eq(tablesTable.id, order.tableId));
  }
  if (order.tableId > 0 && parsed.data.status === "ready_to_pay") {
    await db.update(tablesTable).set({ occupancyStatus: "payment_pending" }).where(eq(tablesTable.id, order.tableId));
  }
  if (order.tableId > 0 && parsed.data.status === "open") {
    await db.update(tablesTable).set({ occupancyStatus: "occupied", currentOrderId: order.id }).where(eq(tablesTable.id, order.tableId));
  }

  res.json(UpdateOrderResponse.parse(formatOrder(order)));
});

router.post("/orders/:id/items", requireAuth, async (req, res): Promise<void> => {
  const params = AddOrderItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isOrderModifiable(order.status)) { res.status(409).json({ error: "This order can no longer be modified." }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) { res.status(403).json({ error: "Permission denied." }); return; }
  const [menuItem] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, parsed.data.menuItemId));
  if (!menuItem) { res.status(404).json({ error: "Menu item not found" }); return; }

  const [item] = await db.insert(orderItemsTable).values({
    orderId: params.data.id,
    menuItemId: parsed.data.menuItemId,
    menuItemName: menuItem.name,
    quantity: parsed.data.quantity,
    unitPrice: menuItem.price,
    customizations: parsed.data.customizations ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();

  await recalcOrder(params.data.id);

  res.status(201).json(formatOrderItem(item));
});

router.patch("/orders/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateOrderItemParams.safeParse({
    id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10),
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isOrderModifiable(order.status)) { res.status(409).json({ error: "This order can no longer be modified." }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) { res.status(403).json({ error: "Permission denied." }); return; }
  const [existingItem] = await db.select().from(orderItemsTable).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  );
  if (!existingItem) { res.status(404).json({ error: "Order item not found" }); return; }

  const payload = { ...parsed.data };
  if (typeof payload.kitchenStatus === "string" && payload.kitchenStatus.trim().toLowerCase() === "cancelled") {
    const actor = req.auth?.role === "guest" ? "customer" : req.auth?.role ?? "staff";
    payload.kitchenStatus = "cancelled";
    payload.notes = normalizeCancelNote(payload.notes ?? existingItem.notes ?? "", actor);
  }

  const [item] = await db.update(orderItemsTable).set(payload).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }

  if (payload.quantity != null || payload.kitchenStatus != null) {
    await syncOrderAfterItemChange(params.data.id);
  }

  res.json(UpdateOrderItemResponse.parse(formatOrderItem(item)));
});

router.delete("/orders/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const params = RemoveOrderItemParams.safeParse({
    id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10),
    itemId: parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10),
  });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isOrderModifiable(order.status)) { res.status(409).json({ error: "This order can no longer be modified." }); return; }
  if (req.auth?.role === "guest" && !canAccessTable(req, order.tableId)) { res.status(403).json({ error: "Permission denied." }); return; }
  if (req.auth?.role === "customer" && req.auth.customerId !== order.customerId) { res.status(403).json({ error: "Permission denied." }); return; }
  const [item] = await db.delete(orderItemsTable).where(
    and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id))
  ).returning();
  if (!item) { res.status(404).json({ error: "Order item not found" }); return; }
  await syncOrderAfterItemChange(params.data.id);
  res.sendStatus(204);
});

router.get("/delivery-orders", requireAuth, async (req, res): Promise<void> => {
  const statusFilter = normalizeText(req.query.status).toLowerCase();
  const regionFilter = normalizeText(req.query.region).toLowerCase();
  const townshipFilter = normalizeText(req.query.township).toLowerCase();
  const streetFilter = normalizeText(req.query.street).toLowerCase();

  const conditions: any[] = [eq(ordersTable.orderSource, "delivery")];
  if (statusFilter) conditions.push(eq(ordersTable.deliveryStatus, statusFilter));
  if (req.auth?.role === "customer" && req.auth.customerId) {
    conditions.push(eq(ordersTable.customerId, req.auth.customerId));
  }

  try {
    const orders = await db
      .select()
      .from(ordersTable)
      .where(and(...conditions))
      .orderBy(sql`${ordersTable.createdAt} desc`);

    const filtered = orders.filter((order) =>
      regionFilter ? (order.deliveryRegion ?? "").toLowerCase().includes(regionFilter) : true,
    ).filter((order) =>
      townshipFilter ? (order.deliveryTownship ?? "").toLowerCase().includes(townshipFilter) : true,
    ).filter((order) =>
      streetFilter ? (order.deliveryStreet ?? "").toLowerCase().includes(streetFilter) : true,
    );

    res.json(
      filtered.map((order) => ({
        ...formatOrder(order),
        customerPhones: (() => {
          try {
            return order.customerPhones ? (JSON.parse(order.customerPhones) as string[]) : [];
          } catch {
            return [];
          }
        })(),
      })),
    );
  } catch (error) {
    if (isDatabaseError(error)) {
      res.json([]);
      return;
    }
    res.status(500).json({ error: "Failed to load delivery orders." });
  }
});

router.patch(
  "/delivery-orders/:id/status",
  requireRoles(["waiter", "cashier", "supervisor", "manager", "owner"]),
  async (req, res): Promise<void> => {
    const id = Number.parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid delivery order id." });
      return;
    }
    const body = (req.body ?? {}) as UpdateDeliveryStatusBody;
    const nextStatus = parseDeliveryStatus(body.status);
    if (!nextStatus) {
      res.status(400).json({ error: "Invalid delivery status." });
      return;
    }

    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!existing || existing.orderSource !== "delivery") {
      res.status(404).json({ error: "Delivery order not found." });
      return;
    }

    const [updated] = await db
      .update(ordersTable)
      .set({
        deliveryStatus: nextStatus,
        status: nextStatus === "cancelled" ? "cancelled" : existing.status,
      })
      .where(eq(ordersTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Delivery order not found." });
      return;
    }

    res.json(formatOrder(updated));
  },
);

export default router;
