import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { buyerRequestsTable, commissionsTable, companiesTable, dealsTable, documentsTable, matchesTable, sellerListingsTable, usersTable } from "@workspace/db";
import { type AuthenticatedRequest, requireRole } from "../auth/middleware";

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
  fileUrl: z.string().url().refine((value) => value.startsWith("https://"), "secure_url_required"),
});

const documentStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const userVerificationStatusSchema = z.object({
  status: z.enum(["pending", "under_review", "verified", "rejected", "suspended"]),
});

async function hasVerifiedCounterparties(buyerUserId: string, sellerUserId: string) {
  const users = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(and(inArray(usersTable.id, [buyerUserId, sellerUserId]), eq(usersTable.status, "verified")));
  return users.some((user) => user.id === buyerUserId && user.role === "buyer")
    && users.some((user) => user.id === sellerUserId && user.role === "seller");
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
      const [requirement] = await db
        .update(buyerRequestsTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(buyerRequestsTable.id, requirementId))
        .returning();
      if (!requirement) {
        res.status(404).json({ error: "buyer_request_not_found" });
        return;
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
      const [offer] = await db
        .update(sellerListingsTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(sellerListingsTable.id, offerId))
        .returning();
      if (!offer) {
        res.status(404).json({ error: "seller_offer_not_found" });
        return;
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
    res.status(201).json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "deal_creation_failed" });
  }
});

router.get("/admin/deals", requireRole("admin"), async (_req, res) => {
  const deals = await db.select().from(dealsTable).orderBy(desc(dealsTable.updatedAt));
  res.json({ deals });
});

router.patch("/admin/deals/:dealId/status", requireRole("admin"), async (req, res) => {
  try {
    const input = dealStatusSchema.parse(req.body);
    const dealId = req.params["dealId"];
    if (typeof dealId !== "string") {
      res.status(400).json({ error: "invalid_deal_id" });
      return;
    }
    const [deal] = await db.update(dealsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(dealsTable.id, dealId))
      .returning();
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
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
    const [commission] = await db.update(commissionsTable)
      .set({ status: input.status, paidAt: input.status === "paid" ? new Date() : null, updatedAt: new Date() })
      .where(eq(commissionsTable.id, commissionId))
      .returning();
    if (!commission) {
      res.status(404).json({ error: "commission_not_found" });
      return;
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
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
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
    const [document] = await db.update(documentsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(documentsTable.id, documentId))
      .returning();
    if (!document) {
      res.status(404).json({ error: "document_not_found" });
      return;
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
    const [existingUser] = await db.select({ id: usersTable.id, role: usersTable.role })
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
    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "user_verification_failed" });
  }
});

export default router;