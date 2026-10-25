import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogsTable, db, notificationsTable, usersTable } from "@workspace/db";
import { type AuthenticatedRequest, requireRole } from "../auth/middleware";
import { buildNoticeBody, createIncidentSchema, incidentNoticeTitle, notifySchema } from "../incidents/incident";
import { SUPPORT_EMAIL } from "../privacy/policies";

const router: IRouter = Router();
const UUID = /^[0-9a-f-]{36}$/i;

router.post("/admin/incidents", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  const parsed = createIncidentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_request" }); return; }
  const found = parsed.data.affectedUserIds.length
    ? await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, parsed.data.affectedUserIds))
    : [];
  const affected = found.map((u) => u.id);
  const [row] = await db.insert(auditLogsTable).values({ actorUserId: req.authUser!.id, action: "incident_logged", entityType: "incident",
    metadata: { ...parsed.data, affectedUserIds: affected, unknownUserIds: parsed.data.affectedUserIds.length - affected.length, loggedAt: new Date().toISOString() } }).returning({ id: auditLogsTable.id });
  res.status(201).json({ id: row!.id, affectedCount: affected.length });
});

router.get("/admin/incidents", requireRole("admin"), async (_req, res) => {
  const rows = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "incident"), eq(auditLogsTable.action, "incident_logged"))).orderBy(desc(auditLogsTable.createdAt)).limit(100);
  const notices = rows.length ? await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.action, "incident_users_notified"), inArray(sql`${auditLogsTable.metadata}->>'incidentId'`, rows.map((r) => r.id)))) : [];
  const notified = new Map<string, number>();
  for (const n of notices) notified.set(String(n.metadata?.["incidentId"]), (notified.get(String(n.metadata?.["incidentId"])) ?? 0) + Number(n.metadata?.["count"] ?? 0));
  res.set("Cache-Control", "no-store").json({ incidents: rows.map((r) => ({ id: r.id, loggedAt: r.createdAt, title: r.metadata?.["title"], severity: r.metadata?.["severity"], dataCategories: r.metadata?.["dataCategories"], affectedCount: (r.metadata?.["affectedUserIds"] as string[] | undefined)?.length ?? 0, notifiedCount: notified.get(r.id) ?? 0 })) });
});

// Queues an in-app notice for every affected user. WhatsApp and email are NOT sent here:
// proactive WhatsApp needs an approved template and email needs owner-approved sending.
router.post("/admin/incidents/:id/notify", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  const id = String(req.params["id"] ?? "");
  const parsed = notifySchema.safeParse(req.body);
  if (!UUID.test(id) || !parsed.success) { res.status(400).json({ error: "invalid_request" }); return; }
  const [inc] = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.id, id), eq(auditLogsTable.action, "incident_logged"))).limit(1);
  if (!inc) { res.status(404).json({ error: "not_found" }); return; }
  const ids = (inc.metadata?.["affectedUserIds"] as string[] | undefined) ?? [];
  if (!ids.length) { res.status(409).json({ error: "no_affected_users" }); return; }
  const body = buildNoticeBody(parsed.data.message, SUPPORT_EMAIL);
  await db.transaction(async (tx) => {
    await tx.insert(notificationsTable).values(ids.map((userId) => ({ userId, type: "incident_notice", title: incidentNoticeTitle(), body, link: "/" })));
    await tx.insert(auditLogsTable).values({ actorUserId: req.authUser!.id, action: "incident_users_notified", entityType: "incident", entityId: id,
      metadata: { incidentId: id, count: ids.length, channel: "in_app", whatsappEmail: "not_sent_template_or_approval_pending", wording: body } });
  });
  res.json({ notified: ids.length, channel: "in_app", whatsappAndEmail: "not sent: needs approved template / approval" });
});

export default router;
