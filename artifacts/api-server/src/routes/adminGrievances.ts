import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogsTable, db } from "@workspace/db";
import { type AuthenticatedRequest, requireRole } from "../auth/middleware";
import { grievanceStatus } from "../grievance/grievance";

const router: IRouter = Router();

router.get("/admin/grievances", requireRole("admin"), async (_req, res) => {
  const rows = await db.select().from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, "grievance"), eq(auditLogsTable.action, "grievance_received")))
    .orderBy(desc(auditLogsTable.createdAt)).limit(200);
  const ids = rows.map((r) => r.id);
  const updates = ids.length
    ? await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.action, "grievance_updated"), inArray(sql`${auditLogsTable.metadata}->>'grievanceId'`, ids))).orderBy(auditLogsTable.createdAt)
    : [];
  const latest = new Map<string, "responded" | "resolved">();
  for (const u of updates) latest.set(String(u.metadata?.["grievanceId"]), u.metadata?.["status"] as "responded" | "resolved");
  const now = new Date();
  res.set("Cache-Control", "no-store").json({
    grievances: rows.map((r) => {
      const dueAt = new Date(String(r.metadata?.["dueAt"]));
      return { id: r.id, receivedAt: r.createdAt, dueAt, text: String(r.metadata?.["text"] ?? ""), ...grievanceStatus(new Date(r.createdAt), dueAt, latest.get(r.id) ?? null, now) };
    }),
  });
});

const updateSchema = z.object({ status: z.enum(["responded", "resolved"]), note: z.string().trim().min(1).max(1000) }).strict();

router.post("/admin/grievances/:id/update", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  const id = String(req.params["id"] ?? "");
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: "invalid_request" }); return; }
  const [g] = await db.select({ id: auditLogsTable.id }).from(auditLogsTable)
    .where(and(eq(auditLogsTable.id, id), eq(auditLogsTable.action, "grievance_received"))).limit(1);
  if (!g) { res.status(404).json({ error: "not_found" }); return; }
  await db.insert(auditLogsTable).values({ actorUserId: req.authUser!.id, action: "grievance_updated", entityType: "grievance", entityId: id,
    metadata: { grievanceId: id, status: parsed.data.status, note: parsed.data.note } });
  res.json({ ok: true });
});

export default router;
