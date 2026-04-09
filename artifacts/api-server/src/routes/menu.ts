import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, menuCategoriesTable, menuItemsTable } from "@workspace/db";
import { requireRoles } from "../lib/auth";
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

type UploadMenuImageBody = {
  fileName?: unknown;
  mimeType?: unknown;
  base64Data?: unknown;
};

function parseImageUploadPayload(base64Data: string): { mimeTypeFromDataUrl: string | null; binary: Buffer } {
  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/i);
  const mimeTypeFromDataUrl = dataUrlMatch?.[1]?.trim() ?? null;
  const base64Payload = (dataUrlMatch?.[2] ?? base64Data).trim();
  const binary = Buffer.from(base64Payload, "base64");
  return { mimeTypeFromDataUrl, binary };
}

function isAllowedImageMime(value: string): boolean {
  return /^image\/[a-z0-9.+-]+$/i.test(value);
}

router.get("/menu-images/proxy", async (req, res): Promise<void> => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) {
    res.status(400).json({ error: "url is required." });
    return;
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL." });
    return;
  }

  if (target.protocol !== "https:") {
    res.status(400).json({ error: "Only https URLs are allowed." });
    return;
  }

  const host = target.hostname.toLowerCase();
  const allowed =
    host === "drive.google.com" ||
    host === "docs.google.com" ||
    host.endsWith(".googleusercontent.com");
  if (!allowed) {
    res.status(403).json({ error: "Host is not allowed for proxy." });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), { redirect: "follow" });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream error: ${upstream.statusText || upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      res.status(415).json({ error: "Upstream response is not an image." });
      return;
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(bytes);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Image proxy failed.",
    });
  }
});

router.post("/menu-images/upload", requireRoles(["supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as UploadMenuImageBody;
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : `menu-${Date.now()}.jpg`;
  const requestedMimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  const base64Data = typeof body.base64Data === "string" ? body.base64Data.trim() : "";

  if (!base64Data) {
    res.status(400).json({ error: "base64Data is required." });
    return;
  }

  try {
    const { mimeTypeFromDataUrl, binary } = parseImageUploadPayload(base64Data);
    if (!Number.isFinite(binary.length) || binary.length < 8) {
      res.status(400).json({ error: "Invalid image data." });
      return;
    }
    if (binary.length > 2_000_000) {
      res.status(413).json({ error: "Image is too large. Keep file under 2MB." });
      return;
    }

    const mimeTypeCandidate = (requestedMimeType || mimeTypeFromDataUrl || "image/jpeg").toLowerCase();
    const mimeType = isAllowedImageMime(mimeTypeCandidate) ? mimeTypeCandidate : "image/jpeg";
    const imageUrl = `data:${mimeType};base64,${binary.toString("base64")}`;

    res.status(201).json({
      fileId: `inline-${Date.now()}`,
      fileName,
      imageUrl,
      webViewLink: imageUrl,
      downloadUrl: imageUrl,
      storage: "inline",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to process image upload.",
    });
  }
});

// ─── Categories ───────────────────────────────────────────────────────────────
router.get("/menu-categories", async (_req, res): Promise<void> => {
  const cats = await db.select().from(menuCategoriesTable).orderBy(menuCategoriesTable.sortOrder);
  res.json(ListMenuCategoriesResponse.parse(cats.map(c => ({ ...c, createdAt: c.createdAt.toISOString() }))));
});

router.post("/menu-categories", requireRoles(["supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const parsed = CreateMenuCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.insert(menuCategoriesTable).values(parsed.data).returning();
  res.status(201).json({ ...cat, createdAt: cat.createdAt.toISOString() });
});

router.patch("/menu-categories/:id", requireRoles(["supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const params = UpdateMenuCategoryParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMenuCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.update(menuCategoriesTable).set(parsed.data).where(eq(menuCategoriesTable.id, params.data.id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(UpdateMenuCategoryResponse.parse({ ...cat, createdAt: cat.createdAt.toISOString() }));
});

router.delete("/menu-categories/:id", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
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

router.post("/menu-items", requireRoles(["supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
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

router.patch("/menu-items/:id", requireRoles(["supervisor", "manager", "owner"]), async (req, res): Promise<void> => {
  const params = UpdateMenuItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMenuItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.update(menuItemsTable).set(parsed.data).where(eq(menuItemsTable.id, params.data.id)).returning();
  if (!item) { res.status(404).json({ error: "Menu item not found" }); return; }
  res.json(UpdateMenuItemResponse.parse({ ...item, price: item.price.toString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
});

router.delete("/menu-items/:id", requireRoles(["manager", "owner"]), async (req, res): Promise<void> => {
  const params = DeleteMenuItemParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
