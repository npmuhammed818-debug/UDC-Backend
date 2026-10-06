import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { auditLogsTable, db, dealParticipantsTable, notificationsTable, referralsTable, usersTable, dealsTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { requireAuth } from "../auth/middleware";
import { buildSafeReferralChain } from "../referrals/agentChain";

const router: IRouter = Router();

const referralRequestSchema = z.object({
  email: z.email().max(254).transform((email) => email.toLowerCase()),
  contactConsent: z.literal(true),
}).strict();

router.post("/referrals/request", requireAuth, async (req, res) => {
  if (req.authUser!.role !== "agent" || !["verified", "active"].includes(req.authUser!.status)) {
    res.status(403).json({ error: "verified_agent_required" }); return;
  }
  const parsed = referralRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "valid_email_and_contact_consent_required" }); return; }
  try {
    const [referred] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(sql`lower(${usersTable.email}) = ${parsed.data.email}`, inArray(usersTable.role, ["buyer", "seller"])))
      .limit(1);
    if (referred && referred.id !== req.authUser!.id) {
      await db.transaction(async (tx) => {
        const [referral] = await tx.insert(referralsTable).values({
          agentUserId: req.authUser!.id,
          referredUserId: referred.id,
          referralCode: `UDC-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: "pending",
        }).onConflictDoNothing().returning({ id: referralsTable.id });
        if (!referral) return;
        await tx.insert(auditLogsTable).values({
          actorUserId: req.authUser!.id, action: "agent_referral_requested",
          entityType: "referral", entityId: referral.id,
          metadata: { referredUserId: referred.id, contactConsentConfirmed: true },
        });
        const admins = await tx.select({ id: usersTable.id }).from(usersTable)
          .where(and(eq(usersTable.role, "admin"), inArray(usersTable.status, ["verified", "active"]))).limit(100);
        if (admins.length) await tx.insert(notificationsTable).values(admins.map((admin) => ({
          userId: admin.id, type: "agent_referral_requested",
          title: "Referral needs review", body: "An agent submitted a referral for review.", link: "/admin/agents",
        })));
      });
    }
    // Do not reveal whether an email is registered or already attributed to another agent.
    res.status(202).json({ message: "If the person has a UDC buyer or seller account, the request will be reviewed. No commission is promised." });
  } catch {
    res.status(500).json({ error: "referral_request_failed" });
  }
});

router.get("/referrals", requireAuth, async (req, res) => {
  if (req.authUser!.role !== "agent") {
    res.status(403).json({ error: "agent_access_required" });
    return;
  }

  const referrals = await db
    .select({
      id: referralsTable.id,
      agentUserId: referralsTable.agentUserId,
      referredUserId: referralsTable.referredUserId,
      referralCode: referralsTable.referralCode,
      status: referralsTable.status,
      commissionRate: referralsTable.commissionRate,
      referredName: usersTable.fullName,
      referredRole: usersTable.role,
      createdAt: referralsTable.createdAt,
      updatedAt: referralsTable.updatedAt,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.agentUserId, req.authUser!.id))
    .orderBy(desc(referralsTable.updatedAt));

  res.json({ referrals });
});

router.get("/agent/deals", requireAuth, async (req, res) => {
  if (req.authUser!.role !== "agent" || !["verified", "active"].includes(req.authUser!.status)) {
    res.status(403).json({ error: "verified_agent_required" }); return;
  }

  const deals = await db.select({
    id: dealsTable.id,
    dealNumber: dealsTable.dealNumber,
    status: dealsTable.status,
    quantity: dealsTable.quantity,
    unit: dealsTable.unit,
    currency: dealsTable.currency,
    destination: dealsTable.destination,
    updatedAt: dealsTable.updatedAt,
  }).from(dealsTable)
    .where(inArray(
      dealsTable.id,
      db.select({ dealId: dealParticipantsTable.dealId })
        .from(dealParticipantsTable)
        .where(and(
          eq(dealParticipantsTable.userId, req.authUser!.id),
          eq(dealParticipantsTable.participantRole, "agent"),
          eq(dealParticipantsTable.status, "active"),
        )),
    ))
    .orderBy(desc(dealsTable.updatedAt));

  const chainRows = deals.length
    ? await db.select({
        dealId: dealParticipantsTable.dealId,
        userId: dealParticipantsTable.userId,
        referredByAgentUserId: dealParticipantsTable.referredByAgentUserId,
        referralPosition: dealParticipantsTable.referralPosition,
        commissionSharePct: dealParticipantsTable.commissionSharePct,
      }).from(dealParticipantsTable)
        .where(and(
          inArray(dealParticipantsTable.dealId, deals.map((deal) => deal.id)),
          eq(dealParticipantsTable.participantRole, "agent"),
          eq(dealParticipantsTable.status, "active"),
        ))
    : [];

  const chainsByDeal = new Map<string, typeof chainRows>();
  for (const member of chainRows) {
    const current = chainsByDeal.get(member.dealId) ?? [];
    current.push(member);
    chainsByDeal.set(member.dealId, current);
  }

  const label = (status: string) => ({
    initiated: "Talking",
    negotiation: "Talking",
    verification: "Verification",
    loi: "LOI sent",
    icpo: "ICPO received",
    fco_sco: "FCO/SCO sent",
    contract: "SPA signed",
    banking: "DLC in progress",
    inspection: "SGS inspection",
    loading: "Loading",
    shipment: "Shipment in progress",
    delivery: "Delivered / destination inspection",
    payment: "Payment stage",
    commission: "Commission stage",
    completed: "Completed",
    on_hold: "On hold",
    cancelled: "Cancelled",
    rejected: "Rejected",
    disputed: "Issue under review",
  } as Record<string, string>)[status] ?? status.replaceAll("_", " ");

  res.json({ deals: deals.map((deal) => ({
    ...deal,
    progress: label(deal.status),
    readOnly: true,
    referralChain: buildSafeReferralChain(chainsByDeal.get(deal.id) ?? [], req.authUser!.id),
  })) });
});

export default router;
