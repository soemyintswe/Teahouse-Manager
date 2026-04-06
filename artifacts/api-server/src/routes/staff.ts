import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, staffTable } from "@workspace/db";
import {
  ListStaffResponse,
  CreateStaffMemberBody,
  UpdateStaffMemberParams,
  UpdateStaffMemberBody,
  UpdateStaffMemberResponse,
  DeleteStaffMemberParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatStaff(s: typeof staffTable.$inferSelect) {
  return { ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

router.get("/staff", async (_req, res): Promise<void> => {
  const members = await db.select().from(staffTable).orderBy(staffTable.name);
  res.json(ListStaffResponse.parse(members.map(formatStaff)));
});

router.post("/staff", async (req, res): Promise<void> => {
  const parsed = CreateStaffMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [member] = await db.insert(staffTable).values(parsed.data).returning();
  res.status(201).json(formatStaff(member));
});

router.patch("/staff/:id", async (req, res): Promise<void> => {
  const params = UpdateStaffMemberParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateStaffMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [member] = await db.update(staffTable).set(parsed.data).where(eq(staffTable.id, params.data.id)).returning();
  if (!member) { res.status(404).json({ error: "Staff member not found" }); return; }
  res.json(UpdateStaffMemberResponse.parse(formatStaff(member)));
});

router.delete("/staff/:id", async (req, res): Promise<void> => {
  const params = DeleteStaffMemberParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(staffTable).where(eq(staffTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
