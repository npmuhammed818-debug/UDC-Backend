import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { auditLogsTable, buyerRequestsTable, commissionsTable, companiesTable, dealsTable, dealParticipantsTable, documentAccessTable, documentsTable, inspectionsTable, dealFinancialsTable, matchesTable, shipmentsTable, messagesTable, notificationsTable, referralsTable, sellerListingsTable, usersTable } from "@workspace/db";
import { type AuthenticatedRequest, requireRole } from "../auth/middleware";
import { sendWhatsAppText } from "../whatsapp/client";
import { createSignedUploadUrl, storagePath } from "../supabase/storage";

const router: IRouter = Router();

const verificationSchema = z.object({
  verification_status: z.enum(["pending", "verified", "rejected"]),
});

router.patch(
  "/admin/companies/:companyId/verification",
  requireRole("admin"),
  async (req, res) => {
    try {
      const { verification_status } = verificationSchema.parse(req.body);
      const companyId = req.params["companyId"];
      if (typeof companyId !== "string") {
        res.status(400).json({ error: "invalid_company_id" });
        return;
      }
      const [company] = await db
        .update(companiesTable)
        .set({
          verificationStatus: verification_status,
          updatedAt: new Date(),
        })
        .where(eq(companiesTable.id, companyId))
        .returning({
          id: companiesTable.id,
          verificationStatus: companiesTable.verificationStatus,
          updatedAt: companiesTable.updatedAt,
        });

      if (!company) {
        res.status(404).json({ error: "company_not_found" });
        return;
      }
      res.json({ company });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "validation_error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      res.status(500).json({ error: "company_verification_failed" });
    }
  },
);

const requirementStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const createMatchSchema = z.object({
  buyerRequestId: z.string().uuid(),
  sellerListingId: z.string().uuid(),
});

const createDealSchema = z.object({
  matchId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  agreedPrice: z.coerce.number().positive(),
  currency: z.string().length(3).optional(),
  incoterm: z.string().min(2).max(12).optional(),
  destination: z.string().min(2).max(120).optional(),
});

const dealStatusSchema = z.object({
  status: z.enum(["initiated", "negotiation", "verification", "loi", "icpo", "fco_sco", "contract", "banking", "inspection", "loading", "shipment", "delivery", "payment", "commission", "completed", "on_hold", "cancelled", "rejected", "disputed"]),
});

const createCommissionSchema = z.object({
  dealId: z.string().uuid(),
  beneficiaryUserId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).optional(),
  commissionType: z.enum(["percentage", "fixed_per_mt", "fixed_amount"]).optional(),
  commissionRate: z.coerce.number().nonnegative().optional(),
});

const commissionStatusSchema = z.object({
  status: z.enum(["pending", "paid", "cancelled"]),
});

const createDocumentSchema = z.object({
  dealId: z.string().uuid(),
  documentType: z.string().min(2).max(80),
  fileUrl: z.string().refine((value) => value.startsWith("storage://udc-documents/") || value.startsWith("https://"), "secure_url_required"),
});

const documentStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const userVerificationStatusSchema = z.object({
  status: z.enum(["pending", "under_review", "verified", "rejected", "suspended"]),
});

const createReferralSchema = z.object({
  agentUserId: z.string().uuid(),
  referredUserId: z.string().uuid(),
  referralCode: z.string().trim().min(3).max(80),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
});

const referralStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
});

const addAgentParticipantSchema = z.object({
  userId: z.string().uuid(),
});

const sendDealNotificationSchema = z.object({
  dealId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  message: z.string().min(1).max(1000),
});

const createInspectionSchema = z.object({
  dealId: z.string().uuid(),
  inspectorName: z.string().min(2).max(160).optional(),
  scheduledAt: z.coerce.date().optional(),
  resultSummary: z.string().max(2000).optional(),
});

const inspectionStatusSchema = z.object({
  status: z.enum(["requested", "scheduled", "in_progress", "passed", "failed", "cancelled"]),
  resultSummary: z.string().max(2000).optional(),
});

const createShipmentSchema = z.object({
  dealId: z.string().uuid(),
  carrier: z.string().min(2).max(160).optional(),
  trackingNumber: z.string().min(2).max(160).optional(),
  origin: z.string().min(2).max(160).optional(),
  destination: z.string().min(2).max(160).optional(),
  estimatedArrival: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

const shipmentStatusSchema = z.object({
  status: z.enum(["planned", "booked", "in_transit", "arrived", "delivered", "cancelled"]),
  notes: z.string().max(2000).optional(),
  estimatedArrival: z.coerce.date().optional(),
});

const createFinancialInstrumentSchema = z.object({
  dealId: z.string().uuid(),
  instrumentType: z.enum(["LC", "DLC", "SBLC", "BG", "TT", "OTHER"]),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().length(3).optional(),
  terms: z.string().max(2000).optional(),
  reference: z.string().max(160).optional(),
  provider: z.string().max(160).optional(),
});

const financialInstrumentStatusSchema = z.object({
  status: z.enum(["not_started", "requested", "pending", "received", "confirmed", "rejected", "cancelled"]),
  reference: z.string().max(160).optional(),
  provider: z.string().max(160).optional(),
  terms: z.string().max(2000).optional(),
});

async function hasVerifiedCounterparties(buyerUserId: string, sellerUserId: string) {
  const users = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(and(inArray(usersTable.id, [buyerUserId, sellerUserId]), eq(usersTable.status, "verified")));
  return users.some((user) => user.id === buyerUserId && user.role === "buyer")
    && users.some((user) => user.id === sellerUserId && user.role === "seller");
}

async function notifyDealCounterparties(
  dealId: string,
  type: string,
  title: string,
  body: string,
  link: string,
) {
  const [deal] = await db
    .select({
      buyerUserId: dealsTable.buyerUserId,
      sellerUserId: dealsTable.sellerUserId,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId))
    .limit(1);

  if (!deal) return;

  await db.insert(notificationsTable).values([
    { userId: deal.buyerUserId, type, title, body, link },
    { userId: deal.sellerUserId, type, title, body, link },
  ]);
}

router.get("/admin/buyer-requests", requireRole("admin"), async (_req, res) => {
  const requirements = await db
    .select()
    .from(buyerRequestsTable)
    .where(eq(buyerRequestsTable.status, "pending_admin_review"))
    .orderBy(desc(buyerRequestsTable.createdAt));
  res.json({ requirements });
});

router.patch(
  "/admin/buyer-requests/:requirementId/status",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = requirementStatusSchema.parse(req.body);
      const requirementId = req.params["requirementId"];
      if (typeof requirementId !== "string") {
        res.status(400).json({ error: "invalid_requirement_id" });
        return;
      }
      const [existing] = await db.select().from(buyerRequestsTable)
        .where(eq(buyerRequestsTable.id, requirementId))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "buyer_request_not_found" });
        return;
      }
      const [requirement] = await db
        .update(buyerRequestsTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(buyerRequestsTable.id, requirementId))
        .returning();
      await db.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "buyer_requirement_reviewed",
        entityType: "buyer_request",
        entityId: requirement.id,
        metadata: { previousStatus: existing.status, newStatus: requirement.status },
      });
      if (existing.status !== requirement.status) {
        await db.insert(notificationsTable).values({
          userId: requirement.buyerUserId,
          type: "buyer_requirement_reviewed",
          title: "Requirement review completed",
          body: `Your buyer requirement was ${requirement.status} by UDC.`,
          link: "/notifications",
        });
      }
      res.json({ requirement });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      res.status(500).json({ error: "buyer_request_review_failed" });
    }
  },
);

router.get("/admin/seller-offers", requireRole("admin"), async (_req, res) => {
  const offers = await db
    .select()
    .from(sellerListingsTable)
    .where(eq(sellerListingsTable.status, "pending_admin_review"))
    .orderBy(desc(sellerListingsTable.createdAt));
  res.json({ offers });
});

router.patch(
  "/admin/seller-offers/:offerId/status",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = requirementStatusSchema.parse(req.body);
      const offerId = req.params["offerId"];
      if (typeof offerId !== "string") {
        res.status(400).json({ error: "invalid_offer_id" });
        return;
      }
      const [existing] = await db.select().from(sellerListingsTable)
        .where(eq(sellerListingsTable.id, offerId))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "seller_offer_not_found" });
        return;
      }
      const [offer] = await db
        .update(sellerListingsTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(sellerListingsTable.id, offerId))
        .returning();
      await db.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "seller_offer_reviewed",
        entityType: "seller_listing",
        entityId: offer.id,
        metadata: { previousStatus: existing.status, newStatus: offer.status },
      });
      if (existing.status !== offer.status) {
        await db.insert(notificationsTable).values({
          userId: offer.sellerUserId,
          type: "seller_offer_reviewed",
          title: "Offer review completed",
          body: `Your seller offer was ${offer.status} by UDC.`,
          link: "/notifications",
        });
      }
      res.json({ offer });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      res.status(500).json({ error: "seller_offer_review_failed" });
    }
  },
);

router.get("/admin/match-candidates", requireRole("admin"), async (_req, res) => {
  const [buyerRequests, sellerOffers] = await Promise.all([
    db.select().from(buyerRequestsTable).where(eq(buyerRequestsTable.status, "approved")).orderBy(desc(buyerRequestsTable.updatedAt)),
    db.select().from(sellerListingsTable).where(eq(sellerListingsTable.status, "approved")).orderBy(desc(sellerListingsTable.updatedAt)),
  ]);
  res.json({ buyerRequests, sellerOffers });
});

router.post("/admin/matches", requireRole("admin"), async (req, res) => {
  try {
    const input = createMatchSchema.parse(req.body);
    const [buyerRequest] = await db.select().from(buyerRequestsTable).where(eq(buyerRequestsTable.id, input.buyerRequestId)).limit(1);
    const [sellerOffer] = await db.select().from(sellerListingsTable).where(eq(sellerListingsTable.id, input.sellerListingId)).limit(1);

    if (!buyerRequest || !sellerOffer) {
      res.status(404).json({ error: "match_record_not_found" });
      return;
    }
    if (buyerRequest.status !== "approved" || sellerOffer.status !== "approved") {
      res.status(409).json({ error: "match_records_require_admin_approval" });
      return;
    }
    if (buyerRequest.productId !== sellerOffer.productId) {
      res.status(409).json({ error: "match_products_do_not_match" });
      return;
    }
    if (!await hasVerifiedCounterparties(buyerRequest.buyerUserId, sellerOffer.sellerUserId)) {
      res.status(409).json({ error: "match_requires_verified_counterparties" });
      return;
    }

    const [existingMatch] = await db.select({ id: matchesTable.id }).from(matchesTable).where(and(
      eq(matchesTable.buyerRequestId, buyerRequest.id),
      eq(matchesTable.sellerListingId, sellerOffer.id),
    )).limit(1);
    if (existingMatch) {
      res.status(409).json({ error: "match_already_exists", matchId: existingMatch.id });
      return;
    }

    const [match] = await db.insert(matchesTable).values({
      buyerRequestId: buyerRequest.id,
      sellerListingId: sellerOffer.id,
      status: "approved",
    }).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "match_created",
      entityType: "match",
      entityId: match.id,
      metadata: { buyerRequestId: match.buyerRequestId, sellerListingId: match.sellerListingId },
    });
    await db.insert(notificationsTable).values([
      {
        userId: buyerRequest.buyerUserId,
        type: "match_created",
        title: "New verified match",
        body: "UDC approved a seller match for your requirement.",
        link: "/notifications",
      },
      {
        userId: sellerOffer.sellerUserId,
        type: "match_created",
        title: "New verified match",
        body: "UDC approved a buyer match for your offer.",
        link: "/notifications",
      },
    ]);
    res.status(201).json({ match });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "match_creation_failed" });
  }
});

router.post("/admin/deals", requireRole("admin"), async (req, res) => {
  try {
    const input = createDealSchema.parse(req.body);
    const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, input.matchId)).limit(1);
    if (!match || match.status !== "approved") {
      res.status(409).json({ error: "deal_requires_approved_match" });
      return;
    }

    const [buyerRequest] = await db.select().from(buyerRequestsTable).where(eq(buyerRequestsTable.id, match.buyerRequestId)).limit(1);
    const [sellerOffer] = await db.select().from(sellerListingsTable).where(eq(sellerListingsTable.id, match.sellerListingId)).limit(1);
    if (!buyerRequest || !sellerOffer || buyerRequest.status !== "approved" || sellerOffer.status !== "approved") {
      res.status(409).json({ error: "deal_records_require_admin_approval" });
      return;
    }
    if (buyerRequest.productId !== sellerOffer.productId || buyerRequest.unit !== sellerOffer.unit) {
      res.status(409).json({ error: "deal_terms_do_not_match" });
      return;
    }
    if (!await hasVerifiedCounterparties(buyerRequest.buyerUserId, sellerOffer.sellerUserId)) {
      res.status(409).json({ error: "deal_requires_verified_counterparties" });
      return;
    }

    const [existingDeal] = await db.select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber })
      .from(dealsTable)
      .where(and(eq(dealsTable.buyerRequestId, buyerRequest.id), eq(dealsTable.sellerListingId, sellerOffer.id)))
      .limit(1);
    if (existingDeal) {
      res.status(409).json({ error: "deal_already_exists", dealId: existingDeal.id, dealNumber: existingDeal.dealNumber });
      return;
    }

    const [deal] = await db.insert(dealsTable).values({
      buyerUserId: buyerRequest.buyerUserId,
      sellerUserId: sellerOffer.sellerUserId,
      buyerRequestId: buyerRequest.id,
      sellerListingId: sellerOffer.id,
      productId: buyerRequest.productId,
      quantity: String(input.quantity),
      unit: buyerRequest.unit,
      agreedPrice: String(input.agreedPrice),
      currency: (input.currency ?? sellerOffer.currency).toUpperCase(),
      incoterm: input.incoterm ?? sellerOffer.incoterm ?? buyerRequest.preferredIncoterm,
      destination: input.destination ?? buyerRequest.destination ?? sellerOffer.destination,
      dealValue: String(input.quantity * input.agreedPrice),
      status: "initiated",
    }).returning();
    await db.insert(dealParticipantsTable).values([
      { dealId: deal.id, userId: deal.buyerUserId, participantRole: "buyer", status: "active" },
      { dealId: deal.id, userId: deal.sellerUserId, participantRole: "seller", status: "active" },
    ]);
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id, action: "deal_created", entityType: "deal", entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, buyerUserId: deal.buyerUserId, sellerUserId: deal.sellerUserId },
    });
    await db.insert(notificationsTable).values([
      {
        userId: deal.buyerUserId,
        type: "deal_created",
        title: "New deal created",
        body: `UDC created deal ${deal.dealNumber}. It is now under admin-managed execution.`,
        link: `/deals/${deal.id}`,
      },
      {
        userId: deal.sellerUserId,
        type: "deal_created",
        title: "New deal created",
        body: `UDC created deal ${deal.dealNumber}. It is now under admin-managed execution.`,
        link: `/deals/${deal.id}`,
      },
    ]);
    res.status(201).json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "deal_creation_failed" });
  }
});

router.get("/admin/referrals", requireRole("admin"), async (_req, res) => {
  const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.updatedAt));
  res.json({ referrals });
});

router.post("/admin/referrals", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = createReferralSchema.parse(req.body);
    const [[agent], [referred]] = await Promise.all([
      db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, input.agentUserId)).limit(1),
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, input.referredUserId)).limit(1),
    ]);
    if (agent?.role !== "agent" || !referred) { res.status(409).json({ error: "invalid_referral_parties" }); return; }
    const [referral] = await db.insert(referralsTable).values({
      agentUserId: agent.id,
      referredUserId: referred.id,
      referralCode: input.referralCode,
      commissionRate: input.commissionRate === undefined ? undefined : String(input.commissionRate),
      status: "pending",
    }).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id, action: "referral_created",
      entityType: "referral", entityId: referral.id,
      metadata: { agentUserId: referral.agentUserId, referredUserId: referral.referredUserId },
    });
    res.status(201).json({ referral });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "referral_create_failed" });
  }
});

router.patch("/admin/referrals/:referralId/status", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = referralStatusSchema.parse(req.body);
    const referralId = req.params["referralId"];
    if (typeof referralId !== "string") {
      res.status(400).json({ error: "invalid_referral_id" });
      return;
    }
    const [existing] = await db.select().from(referralsTable)
      .where(eq(referralsTable.id, referralId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "referral_not_found" });
      return;
    }
    const [referral] = await db.update(referralsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(referralsTable.id, referralId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id,
      action: "referral_status_updated",
      entityType: "referral",
      entityId: referral.id,
      metadata: { previousStatus: existing.status, newStatus: referral.status },
    });
    if (existing.status !== referral.status) {
      await db.insert(notificationsTable).values({
        userId: referral.agentUserId,
        type: "referral_status_updated",
        title: "Referral status updated",
        body: `Your referral is now ${referral.status}.`,
        link: "/referrals",
      });
    }
    res.json({ referral });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "referral_status_update_failed" });
  }
});

router.get("/admin/deals", requireRole("admin"), async (_req, res) => {
  const deals = await db.select().from(dealsTable).orderBy(desc(dealsTable.updatedAt));
  res.json({ deals });
});

router.patch("/admin/deals/:dealId/status", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = dealStatusSchema.parse(req.body);
    const dealId = req.params["dealId"];
    if (typeof dealId !== "string") {
      res.status(400).json({ error: "invalid_deal_id" });
      return;
    }
    const [existingDeal] = await db.select({ id: dealsTable.id, status: dealsTable.status })
      .from(dealsTable)
      .where(eq(dealsTable.id, dealId))
      .limit(1);
    if (!existingDeal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    const [deal] = await db.update(dealsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(dealsTable.id, dealId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id,
      action: "deal_status_updated",
      entityType: "deal",
      entityId: deal.id,
      metadata: { previousStatus: existingDeal.status, newStatus: deal.status },
    });
    if (existingDeal.status !== deal.status) {
      await db.insert(notificationsTable).values([
        { userId: deal.buyerUserId, type: "deal_status_updated", title: "Deal status updated", body: `Deal ${deal.dealNumber} is now ${deal.status}.`, link: `/deals/${deal.id}` },
        { userId: deal.sellerUserId, type: "deal_status_updated", title: "Deal status updated", body: `Deal ${deal.dealNumber} is now ${deal.status}.`, link: `/deals/${deal.id}` },
      ]);
    }
    res.json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "deal_status_update_failed" });
  }
});

const dealIssueSchema = z.object({
  status: z.enum(["on_hold", "disputed"]),
  reason: z.string().min(5).max(2000),
});

router.post("/admin/deals/:dealId/issues", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = dealIssueSchema.parse(req.body);
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.update(dealsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(dealsTable.id, dealId))
      .returning();
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id,
      action: "deal_issue_recorded",
      entityType: "deal",
      entityId: deal.id,
      metadata: { status: input.status, reason: input.reason },
    });
    await notifyDealCounterparties(
      deal.id,
      "deal_issue_recorded",
      "Deal requires attention",
      `Your deal is now ${input.status}. UDC will contact you with the next step.`,
      `/deals/${deal.id}`,
    );
    res.json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "deal_issue_record_failed" });
  }
});

router.get("/admin/deals/:dealId/audit-log", requireRole("admin"), async (req, res) => {
  const dealId = req.params["dealId"];
  if (typeof dealId !== "string") {
    res.status(400).json({ error: "invalid_deal_id" });
    return;
  }
  const logs = await db.select().from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, "deal"), eq(auditLogsTable.entityId, dealId)))
    .orderBy(desc(auditLogsTable.createdAt));
  res.json({ logs });
});

router.get("/admin/commissions", requireRole("admin"), async (_req, res) => {
  const commissions = await db.select().from(commissionsTable).orderBy(desc(commissionsTable.updatedAt));
  res.json({ commissions });
});

router.post("/admin/commissions", requireRole("admin"), async (req, res) => {
  try {
    const input = createCommissionSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id, currency: dealsTable.currency }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
    const [beneficiary] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, input.beneficiaryUserId)).limit(1);
    if (!deal || !beneficiary) {
      res.status(404).json({ error: "commission_record_not_found" });
      return;
    }

    const [commission] = await db.insert(commissionsTable).values({
      dealId: deal.id,
      beneficiaryUserId: beneficiary.id,
      amount: String(input.amount),
      currency: (input.currency ?? deal.currency).toUpperCase(),
      status: "pending",
      commissionType: input.commissionType,
      commissionRate: input.commissionRate === undefined ? undefined : String(input.commissionRate),
      commissionAmount: String(input.amount),
    }).returning();
    await db.insert(notificationsTable).values({
      userId: commission.beneficiaryUserId,
      type: "commission_created",
      title: "Commission recorded",
      body: `A ${commission.currency} ${commission.amount} commission was recorded for your deal.`,
      link: "/commissions",
    });
    res.status(201).json({ commission });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "commission_creation_failed" });
  }
});

router.patch("/admin/commissions/:commissionId/status", requireRole("admin"), async (req, res) => {
  try {
    const input = commissionStatusSchema.parse(req.body);
    const commissionId = req.params["commissionId"];
    if (typeof commissionId !== "string") {
      res.status(400).json({ error: "invalid_commission_id" });
      return;
    }
    const [existing] = await db.select().from(commissionsTable)
      .where(eq(commissionsTable.id, commissionId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "commission_not_found" });
      return;
    }
    const [commission] = await db.update(commissionsTable)
      .set({ status: input.status, paidAt: input.status === "paid" ? new Date() : null, updatedAt: new Date() })
      .where(eq(commissionsTable.id, commissionId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "commission_status_updated",
      entityType: "commission",
      entityId: commission.id,
      metadata: { dealId: commission.dealId, previousStatus: existing.status, newStatus: commission.status },
    });
    if (existing.status !== commission.status) {
      await db.insert(notificationsTable).values({
        userId: commission.beneficiaryUserId,
        type: "commission_status_updated",
        title: "Commission status updated",
        body: `Your commission is now ${commission.status}.`,
        link: "/commissions",
      });
    }
    res.json({ commission });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "commission_status_update_failed" });
  }
});

const documentUploadSchema = z.object({
  dealId: z.string().uuid(),
  documentType: z.string().min(2).max(80),
  fileName: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(180),
});

router.post("/admin/document-uploads", requireRole("admin"), async (req, res) => {
  try {
    const input = documentUploadSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(eq(dealsTable.id, input.dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const path = `deals/${deal.id}/${crypto.randomUUID()}-${input.fileName}`;
    const uploadUrl = await createSignedUploadUrl(path);
    res.status(201).json({
      uploadUrl,
      document: { dealId: deal.id, documentType: input.documentType, fileUrl: storagePath(path) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(503).json({ error: "document_storage_unavailable" });
  }
});

router.get("/admin/documents", requireRole("admin"), async (req, res) => {
  const dealId = req.query.dealId;
  const documents = typeof dealId === "string"
    ? await db.select().from(documentsTable).where(eq(documentsTable.dealId, dealId)).orderBy(desc(documentsTable.createdAt))
    : await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));
  res.json({ documents });
});

router.post("/admin/documents", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = createDocumentSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id, buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    const [document] = await db.insert(documentsTable).values({
      dealId: deal.id,
      uploadedBy: req.authUser.id,
      documentType: input.documentType,
      fileUrl: input.fileUrl,
      status: "pending",
    }).returning();
    await db.insert(documentAccessTable).values([
      { documentId: document.id, userId: deal.buyerUserId, accessRole: "viewer" },
      { documentId: document.id, userId: deal.sellerUserId, accessRole: "viewer" },
    ]);
    res.status(201).json({ document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "document_registration_failed" });
  }
});

router.patch("/admin/documents/:documentId/status", requireRole("admin"), async (req, res) => {
  try {
    const input = documentStatusSchema.parse(req.body);
    const documentId = req.params["documentId"];
    if (typeof documentId !== "string") {
      res.status(400).json({ error: "invalid_document_id" });
      return;
    }
    const [existing] = await db.select().from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "document_not_found" });
      return;
    }
    const [document] = await db.update(documentsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(documentsTable.id, documentId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "document_reviewed",
      entityType: "document",
      entityId: document.id,
      metadata: { previousStatus: existing.status, newStatus: document.status },
    });
    if (existing.status !== document.status) {
      await notifyDealCounterparties(
        document.dealId,
        "document_reviewed",
        "Document review completed",
        `A deal document was ${document.status} by UDC.`,
        "/documents",
      );
    }
    res.json({ document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "document_review_failed" });
  }
});

router.get("/admin/users/pending-verification", requireRole("admin"), async (_req, res) => {
  const users = await db.select().from(usersTable)
    .where(and(
      inArray(usersTable.role, ["buyer", "seller"]),
      inArray(usersTable.status, ["pending", "under_review"]),
    ))
    .orderBy(desc(usersTable.updatedAt));
  res.json({ users });
});

router.patch("/admin/users/:userId/verification", requireRole("admin"), async (req, res) => {
  try {
    const input = userVerificationStatusSchema.parse(req.body);
    const userId = req.params["userId"];
    if (typeof userId !== "string") {
      res.status(400).json({ error: "invalid_user_id" });
      return;
    }
    const [existingUser] = await db.select({
      id: usersTable.id,
      role: usersTable.role,
      status: usersTable.status,
    })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!existingUser) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    if (!["buyer", "seller"].includes(existingUser.role)) {
      res.status(409).json({ error: "user_is_not_trade_counterparty" });
      return;
    }
    const [user] = await db.update(usersTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, role: usersTable.role, status: usersTable.status, updatedAt: usersTable.updatedAt });
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "user_verification_status_updated",
      entityType: "user",
      entityId: user.id,
      metadata: { previousStatus: existingUser.status, newStatus: user.status },
    });
    if (existingUser.status !== user.status) {
      await db.insert(notificationsTable).values({
        userId: user.id,
        type: "verification_status_updated",
        title: "Verification status updated",
        body: `Your UDC verification status is now ${user.status}.`,
        link: "/profile",
      });
    }
    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "user_verification_failed" });
  }
});

router.post("/admin/deal-notifications/whatsapp", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = sendDealNotificationSchema.parse(req.body);
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
    if (!deal || ![deal.buyerUserId, deal.sellerUserId].includes(input.recipientUserId)) {
      res.status(404).json({ error: "deal_recipient_not_found" });
      return;
    }
    const [recipient] = await db.select({ id: usersTable.id, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, input.recipientUserId))
      .limit(1);
    if (!recipient?.phone) {
      res.status(409).json({ error: "recipient_phone_missing" });
      return;
    }

    const delivery = await sendWhatsAppText(recipient.phone, input.message);
    if (!delivery.delivered) {
      res.status(503).json({ error: "whatsapp_not_configured" });
      return;
    }
    const [message] = await db.insert(messagesTable).values({
      dealId: deal.id,
      senderUserId: req.authUser.id,
      receiverUserId: recipient.id,
      message: input.message,
    }).returning();
    res.status(201).json({ message, delivery });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(502).json({ error: "whatsapp_delivery_failed" });
  }
});

router.get("/admin/deals/:dealId/messages", requireRole("admin"), async (req, res) => {
  const dealId = req.params["dealId"];
  if (typeof dealId !== "string") {
    res.status(400).json({ error: "invalid_deal_id" });
    return;
  }
  const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
  if (!deal) {
    res.status(404).json({ error: "deal_not_found" });
    return;
  }
  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.dealId, deal.id))
    .orderBy(desc(messagesTable.createdAt));
  res.json({ messages });
});

router.get("/admin/buyer-requests/:requirementId/match-recommendations", requireRole("admin"), async (req, res) => {
  const requirementId = req.params["requirementId"];
  const parsedId = z.string().uuid().safeParse(requirementId);
  if (!parsedId.success) {
    res.status(400).json({ error: "invalid_requirement_id" });
    return;
  }

  const [buyerRequest] = await db.select().from(buyerRequestsTable)
    .where(eq(buyerRequestsTable.id, parsedId.data))
    .limit(1);
  if (!buyerRequest || buyerRequest.status !== "approved") {
    res.status(404).json({ error: "approved_buyer_request_not_found" });
    return;
  }

  const offers = await db.select().from(sellerListingsTable)
    .where(and(eq(sellerListingsTable.status, "approved"), eq(sellerListingsTable.productId, buyerRequest.productId)))
    .orderBy(desc(sellerListingsTable.updatedAt));
  const recommendations = [];

  for (const offer of offers) {
    if (!await hasVerifiedCounterparties(buyerRequest.buyerUserId, offer.sellerUserId)) continue;
    const buyerQuantity = Number(buyerRequest.quantity);
    const availableQuantity = Number(offer.quantity);
    const targetPrice = buyerRequest.targetPrice ? Number(buyerRequest.targetPrice) : undefined;
    const offerPrice = Number(offer.price);
    const reasons = ["same approved product", "both counterparties verified"];
    let score = 50;
    if (availableQuantity >= buyerQuantity) {
      score += 25;
      reasons.push("available quantity covers the request");
    }
    if (targetPrice !== undefined && offer.currency === buyerRequest.currency && offerPrice <= targetPrice) {
      score += 25;
      reasons.push("offer price is within the buyer target");
    }
    recommendations.push({ sellerOffer: offer, score, reasons });
  }

  res.json({ buyerRequest, recommendations });
});

router.get("/admin/inspections", requireRole("admin"), async (req, res) => {
  const dealId = req.query.dealId;
  const inspections = typeof dealId === "string"
    ? await db.select().from(inspectionsTable).where(eq(inspectionsTable.dealId, dealId)).orderBy(desc(inspectionsTable.updatedAt))
    : await db.select().from(inspectionsTable).orderBy(desc(inspectionsTable.updatedAt));
  res.json({ inspections });
});

router.post("/admin/inspections", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = createInspectionSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    const [inspection] = await db.insert(inspectionsTable).values({
      dealId: deal.id,
      requestedBy: req.authUser.id,
      inspectorName: input.inspectorName,
      scheduledAt: input.scheduledAt,
      resultSummary: input.resultSummary,
      status: input.scheduledAt ? "scheduled" : "requested",
    }).returning();
    res.status(201).json({ inspection });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "inspection_create_failed" });
  }
});

router.patch("/admin/inspections/:inspectionId", requireRole("admin"), async (req, res) => {
  try {
    const input = inspectionStatusSchema.parse(req.body);
    const inspectionId = req.params["inspectionId"];
    if (typeof inspectionId !== "string") {
      res.status(400).json({ error: "invalid_inspection_id" });
      return;
    }
    const [existing] = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.id, inspectionId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "inspection_not_found" });
      return;
    }
    const [inspection] = await db.update(inspectionsTable)
      .set({ status: input.status, ...(input.resultSummary === undefined ? {} : { resultSummary: input.resultSummary }), updatedAt: new Date() })
      .where(eq(inspectionsTable.id, inspectionId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "inspection_status_updated",
      entityType: "deal",
      entityId: inspection.dealId,
      metadata: { inspectionId: inspection.id, previousStatus: existing.status, newStatus: inspection.status },
    });
    if (existing.status !== inspection.status) {
      await notifyDealCounterparties(
        inspection.dealId,
        "inspection_status_updated",
        "Inspection status updated",
        `Inspection for your deal is now ${inspection.status}.`,
        `/deals/${inspection.dealId}/tracking`,
      );
    }
    res.json({ inspection });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "inspection_update_failed" });
  }
});

router.get("/admin/shipments", requireRole("admin"), async (req, res) => {
  const dealId = req.query.dealId;
  const shipments = typeof dealId === "string"
    ? await db.select().from(shipmentsTable).where(eq(shipmentsTable.dealId, dealId)).orderBy(desc(shipmentsTable.updatedAt))
    : await db.select().from(shipmentsTable).orderBy(desc(shipmentsTable.updatedAt));
  res.json({ shipments });
});

router.post("/admin/shipments", requireRole("admin"), async (req, res) => {
  try {
    const input = createShipmentSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    const [shipment] = await db.insert(shipmentsTable).values({
      dealId: deal.id, carrier: input.carrier, trackingNumber: input.trackingNumber,
      origin: input.origin, destination: input.destination, estimatedArrival: input.estimatedArrival,
      notes: input.notes, status: "planned",
    }).returning();
    res.status(201).json({ shipment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "shipment_create_failed" });
  }
});

router.patch("/admin/shipments/:shipmentId", requireRole("admin"), async (req, res) => {
  try {
    const input = shipmentStatusSchema.parse(req.body);
    const shipmentId = req.params["shipmentId"];
    if (typeof shipmentId !== "string") {
      res.status(400).json({ error: "invalid_shipment_id" });
      return;
    }
    const [existing] = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.id, shipmentId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "shipment_not_found" });
      return;
    }
    const [shipment] = await db.update(shipmentsTable)
      .set({ status: input.status, ...(input.notes === undefined ? {} : { notes: input.notes }), ...(input.estimatedArrival === undefined ? {} : { estimatedArrival: input.estimatedArrival }), updatedAt: new Date() })
      .where(eq(shipmentsTable.id, shipmentId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "shipment_status_updated",
      entityType: "deal",
      entityId: shipment.dealId,
      metadata: { shipmentId: shipment.id, previousStatus: existing.status, newStatus: shipment.status },
    });
    if (existing.status !== shipment.status) {
      await notifyDealCounterparties(
        shipment.dealId,
        "shipment_status_updated",
        "Shipment status updated",
        `Shipment for your deal is now ${shipment.status}.`,
        `/deals/${shipment.dealId}/tracking`,
      );
    }
    res.json({ shipment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "shipment_update_failed" });
  }
});

router.get("/admin/financial-instruments", requireRole("admin"), async (req, res) => {
  const dealId = req.query.dealId;
  const instruments = typeof dealId === "string"
    ? await db.select().from(dealFinancialsTable).where(eq(dealFinancialsTable.dealId, dealId)).orderBy(desc(dealFinancialsTable.updatedAt))
    : await db.select().from(dealFinancialsTable).orderBy(desc(dealFinancialsTable.updatedAt));
  res.json({ instruments });
});

router.post("/admin/financial-instruments", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = createFinancialInstrumentSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id, currency: dealsTable.currency }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    const [instrument] = await db.insert(dealFinancialsTable).values({
      dealId: deal.id, instrumentType: input.instrumentType, status: "not_started",
      amount: input.amount === undefined ? undefined : String(input.amount),
      currency: (input.currency ?? deal.currency).toUpperCase(), terms: input.terms,
      reference: input.reference, provider: input.provider,
    }).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id, action: "financial_instrument_created",
      entityType: "deal", entityId: deal.id,
      metadata: { instrumentId: instrument.id, instrumentType: instrument.instrumentType, status: instrument.status },
    });
    res.status(201).json({ instrument });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "financial_instrument_create_failed" });
  }
});

router.patch("/admin/financial-instruments/:instrumentId", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = financialInstrumentStatusSchema.parse(req.body);
    const instrumentId = req.params["instrumentId"];
    if (typeof instrumentId !== "string") {
      res.status(400).json({ error: "invalid_instrument_id" });
      return;
    }
    const [existing] = await db.select().from(dealFinancialsTable).where(eq(dealFinancialsTable.id, instrumentId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "financial_instrument_not_found" });
      return;
    }
    const [instrument] = await db.update(dealFinancialsTable).set({
      status: input.status, ...(input.reference === undefined ? {} : { reference: input.reference }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.terms === undefined ? {} : { terms: input.terms }), updatedAt: new Date(),
    }).where(eq(dealFinancialsTable.id, instrumentId)).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id, action: "financial_instrument_status_updated",
      entityType: "deal", entityId: instrument.dealId,
      metadata: { instrumentId: instrument.id, previousStatus: existing.status, newStatus: instrument.status },
    });
    if (existing.status !== instrument.status) {
      await notifyDealCounterparties(
        instrument.dealId,
        "payment_status_updated",
        "Payment status updated",
        `${instrument.instrumentType} for your deal is now ${instrument.status}.`,
        `/deals/${instrument.dealId}/payment-status`,
      );
    }
    res.json({ instrument });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "financial_instrument_update_failed" });
  }
});

router.post("/admin/deals/:dealId/agents", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = addAgentParticipantSchema.parse(req.body);
    const dealId = req.params["dealId"];
    if (typeof dealId !== "string") {
      res.status(400).json({ error: "invalid_deal_id" });
      return;
    }
    const [[deal], [agent]] = await Promise.all([
      db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1),
      db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, input.userId)).limit(1),
    ]);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    if (agent?.role !== "agent") {
      res.status(409).json({ error: "user_is_not_agent" });
      return;
    }
    const [participant] = await db.insert(dealParticipantsTable).values({
      dealId: deal.id,
      userId: agent.id,
      participantRole: "agent",
      status: "active",
    }).onConflictDoNothing().returning();
    if (!participant) {
      res.status(409).json({ error: "agent_already_assigned" });
      return;
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser.id,
      action: "deal_agent_assigned",
      entityType: "deal",
      entityId: deal.id,
      metadata: { agentUserId: agent.id },
    });
    await db.insert(notificationsTable).values({
      userId: agent.id,
      type: "deal_agent_assigned",
      title: "You were assigned to a deal",
      body: "UDC assigned you to a deal. You can now follow its progress.",
      link: `/deals/${deal.id}`,
    });
    res.status(201).json({ participant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "deal_agent_assignment_failed" });
  }
});

router.get("/admin/deals/:dealId/participants", requireRole("admin"), async (req, res) => {
  const dealId = req.params["dealId"];
  if (typeof dealId !== "string") {
    res.status(400).json({ error: "invalid_deal_id" });
    return;
  }
  const participants = await db.select().from(dealParticipantsTable)
    .where(eq(dealParticipantsTable.dealId, dealId))
    .orderBy(desc(dealParticipantsTable.createdAt));
  res.json({ participants });
});

router.get("/admin/documents/:documentId/access", requireRole("admin"), async (req, res) => {
  const documentId = req.params["documentId"];
  if (typeof documentId !== "string") {
    res.status(400).json({ error: "invalid_document_id" });
    return;
  }
  const access = await db.select().from(documentAccessTable)
    .where(eq(documentAccessTable.documentId, documentId))
    .orderBy(desc(documentAccessTable.createdAt));
  res.json({ access });
});

router.get("/admin/notifications", requireRole("admin"), async (req, res) => {
  const userId = req.query.userId;
  const notifications = typeof userId === "string"
    ? await db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId)).orderBy(desc(notificationsTable.createdAt))
    : await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));
  res.json({ notifications });
});

export default router;