import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatSettings(s: typeof settingsTable.$inferSelect) {
  return {
    ...s,
    taxRate: s.taxRate.toString(),
    airconFee: s.airconFee.toString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/settings", async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    // Create default settings
    [settings] = await db.insert(settingsTable).values({}).returning();
  }
  res.json(GetSettingsResponse.parse(formatSettings(settings)));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({}).returning();
  }

  const [updated] = await db.update(settingsTable).set(parsed.data).where(eq(settingsTable.id, settings.id)).returning();
  res.json(UpdateSettingsResponse.parse(formatSettings(updated)));
});

export default router;
