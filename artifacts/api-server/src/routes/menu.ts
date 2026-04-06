import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, menuCategoriesTable, menuItemsTable } from "@workspace/db";
import {
  CreateMenuCategoryBody,
  UpdateMenuCategoryParams,
  UpdateMenuCategoryBody,
  UpdateMenuCategoryResponse,
  DeleteMenuCategoryParams,
  ListMenuCategoriesResponse,
  ListMenuItemsQueryParams,
  ListMenuItemsResponse,
  CreateMenuItemBody,
  GetMenuItemParams,
  GetMenuItemResponse,
  UpdateMenuItemParams,
  UpdateMenuItemBody,
  UpdateMenuItemResponse,
  DeleteMenuItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Categories ───────────────────────────────────────────────────────────────
router.get("/menu-categories", async (_req, res): Promise<void> => {
  const cats = await db.select().from(menuCategoriesTable).orderBy(menuCategoriesTable.sortOrder);
  res.json(ListMenuCategoriesResponse.parse(cats.map(c => ({ ...c, createdAt: c.createdAt.toISOString() }))));
});

router.post("/menu-categories", async (req, res): Promise<void> => {
  const parsed = CreateMenuCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.insert(menuCategoriesTable).values(parsed.data).returning();
  res.status(201).json({ ...cat, createdAt: cat.createdAt.toISOString() });
});

router.patch("/menu-categories/:id", async (req, res): Promise<void> => {
  const params = UpdateMenuCategoryParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMenuCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.update(menuCategoriesTable).set(parsed.data).where(eq(menuCategoriesTable.id, params.data.id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(UpdateMenuCategoryResponse.parse({ ...cat, createdAt: cat.createdAt.toISOString() }));
});

router.delete("/menu-categories/:id", async (req, res): Promise<void> => {
  const params = DeleteMenuCategoryParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(menuCategoriesTable).where(eq(menuCategoriesTable.id, params.data.id));
  res.sendStatus(204);
});

// ─── Menu Items ───────────────────────────────────────────────────────────────
router.get("/menu-items", async (req, res): Promise<void> => {
  const qp = ListMenuItemsQueryParams.safeParse(req.query);
  const conditions: ReturnType<typeof eq>[] = [];
  if (qp.success && qp.data.categoryId != null) {
    conditions.push(eq(menuItemsTable.categoryId, qp.data.categoryId));
  }
  if (qp.success && qp.data.available != null) {
    conditions.push(eq(menuItemsTable.available, qp.data.available));
  }
  if (qp.success && qp.data.station != null) {
    conditions.push(eq(menuItemsTable.station, qp.data.station));
  }
  const results =
    conditions.length > 0
      ? await db.select().from(menuItemsTable).where(and(...conditions)).orderBy(menuItemsTable.sortOrder)
      : await db.select().from(menuItemsTable).orderBy(menuItemsTable.sortOrder);
  res.json(ListMenuItemsResponse.parse(results.map(i => ({
    ...i,
    price: i.price.toString(),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }))));
});

router.post("/menu-items", async (req, res): Promise<void> => {
  const parsed = CreateMenuItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const qrCode = `item-${parsed.data.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
  const [item] = await db.insert(menuItemsTable).values({
    ...parsed.data,
    station: parsed.data.station ?? "kitchen",
    qrCode,
    sortOrder: parsed.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json(GetMenuItemResponse.parse({ ...item, price: item.price.toString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
});

router.get("/menu-items/:id", async (req, res): Promise<void> => {
  const params = GetMenuItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [item] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, params.data.id));
  if (!item) { res.status(404).json({ error: "Menu item not found" }); return; }
  res.json(GetMenuItemResponse.parse({ ...item, price: item.price.toString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
});

router.patch("/menu-items/:id", async (req, res): Promise<void> => {
  const params = UpdateMenuItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMenuItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.update(menuItemsTable).set(parsed.data).where(eq(menuItemsTable.id, params.data.id)).returning();
  if (!item) { res.status(404).json({ error: "Menu item not found" }); return; }
  res.json(UpdateMenuItemResponse.parse({ ...item, price: item.price.toString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
});

router.delete("/menu-items/:id", async (req, res): Promise<void> => {
  const params = DeleteMenuItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
