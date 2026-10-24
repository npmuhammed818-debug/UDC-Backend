import { etaAdvisory } from "../tracking/etaAdvisory";
import { recordedDealTerms } from '../deals/recordedTerms';
import { Router, raw, type IRouter } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { auditLogsTable, buyerRequestsTable, companiesTable, db, dealFinancialsTable, dealsTable, documentAccessTable, documentsTable, inspectionsTable, messagesTable, productsTable, sellerListingsTable, shipmentsTable, shipmentTrackingEventsTable, shipmentCargoUnitsTable, dealMeetingsTable, dealCasesTable, customsClearanceTable, dealFeedbackTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { requireNonAgentDealAccess } from "../auth/agentDealPrivacy";
import { createSignedDownloadUrl, uploadDocumentBytes } from "../supabase/storage";
import { createNcndaDraft } from "../deals/ncndaDraft";
import { createSpaDraft } from "../deals/spaDraft";
import { createLoiDraft } from "../deals/loiDraft";
import { createFcoDraft } from "../deals/fcoDraft";
import { createIcpoDraft } from "../deals/icpoDraft";

import { dealAccess } from "../deals/access";
import { managedDealDocumentPath } from "../supabase/documentAccessPath";

const router: IRouter = Router();
const documentType = z.enum(["LOI", "ICPO", "FCO", "SCO", "SPA", "NCNDA", "SGS", "BL", "CO", "COA", "trade_document", "company_registration", "business_license", "certificate", "invoice", "packing_list", "bill_of_lading", "inspection_report", "certificate_of_origin", "other"]);


router.get("/deals/:dealId/documents", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  if(req.authUser!.role!=="admin" && req.authUser!.status!=="verified"){
    res.status(403).json({error:"verification_required"});return;
  }
  try {
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const documents = await db.select({
      id: documentsTable.id, dealId: documentsTable.dealId,
      documentType: documentsTable.documentType, fileUrl: documentsTable.fileUrl,
      status: documentsTable.status, createdAt: documentsTable.createdAt,
    }).from(documentsTable)
      .innerJoin(documentAccessTable, eq(documentAccessTable.documentId, documentsTable.id))
      .where(and(
        eq(documentsTable.dealId, deal.id),
        eq(documentAccessTable.userId, req.authUser!.id),
        or(eq(documentsTable.status, "approved"), eq(documentsTable.uploadedBy, req.authUser!.id)),
      )).orderBy(desc(documentsTable.createdAt));
    res.json({ documents: await Promise.all(documents.map(async (item) => {
      const ownedPath = item.status==="approved" || item.status==="pending"
        ? managedDealDocumentPath(item.fileUrl,deal.id) : null;
      // Rejected or failed files remain visible for review but cannot be
      // distributed as bearer URLs, including to the original uploader.
      return { ...item, fileUrl: ownedPath ? await createSignedDownloadUrl(ownedPath) : null };
    })) });
  } catch { res.status(500).json({ error: "deal_documents_fetch_failed" }); }
});

router.post("/deals/:dealId/documents/upload", requireAuth, requireNonAgentDealAccess,
  raw({ type: "application/pdf", limit: "5mb" }), async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    const type = documentType.parse(req.query["documentType"]);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), or(
        eq(dealsTable.buyerUserId, req.authUser!.id),
        eq(dealsTable.sellerUserId, req.authUser!.id),
      ))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const bytes = req.body as Buffer;
    if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > 5 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") {
      res.status(400).json({ error: "pdf_required_max_5mb" }); return;
    }
    const path = `deals/${deal.id}/${randomUUID()}.pdf`;
    const fileUrl = await uploadDocumentBytes(path, bytes, "application/pdf");
    const [document] = await db.insert(documentsTable).values({
      dealId: deal.id, uploadedBy: req.authUser!.id,
      documentType: type, fileUrl, status: "pending",
    }).returning();
    await db.insert(documentAccessTable).values({ documentId: document.id, userId: req.authUser!.id, accessRole: "owner" });
    await db.insert(auditLogsTable).values({ actorUserId: req.authUser!.id,
      action: "deal_document_uploaded", entityType: "document", entityId: document.id,
      metadata: { dealId: deal.id, documentType: type },
    });
    res.status(201).json({ document: { id: document.id, dealId: deal.id, documentType: type, status: document.status } });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "document_upload_failed" });
  }
});

router.get("/deals/:dealId/messages", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const messages = await db.select().from(messagesTable).where(and(
      eq(messagesTable.dealId, deal.id),
      or(eq(messagesTable.senderUserId, req.authUser!.id), eq(messagesTable.receiverUserId, req.authUser!.id)),
    )).orderBy(desc(messagesTable.createdAt));
    res.json({ messages });
  } catch { res.status(500).json({ error: "deal_messages_fetch_failed" }); }
});

router.get("/deals/:dealId/execution", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const [meetings, cases, customs, feedback] = await Promise.all([
      db.select({ id: dealMeetingsTable.id, status: dealMeetingsTable.status, scheduledAt: dealMeetingsTable.scheduledAt, provider: dealMeetingsTable.provider, meetingUrl: dealMeetingsTable.meetingUrl, agenda: dealMeetingsTable.agenda, completedAt: dealMeetingsTable.completedAt }).from(dealMeetingsTable).where(eq(dealMeetingsTable.dealId, dealId)).orderBy(desc(dealMeetingsTable.createdAt)),
      db.select({ id: dealCasesTable.id, caseType: dealCasesTable.caseType, priority: dealCasesTable.priority, status: dealCasesTable.status, summary: dealCasesTable.summary, resolution: dealCasesTable.resolution, updatedAt: dealCasesTable.updatedAt }).from(dealCasesTable).where(eq(dealCasesTable.dealId, dealId)).orderBy(desc(dealCasesTable.createdAt)),
      db.select({ status: customsClearanceTable.status, country: customsClearanceTable.country, port: customsClearanceTable.port, reference: customsClearanceTable.reference, clearedAt: customsClearanceTable.clearedAt, updatedAt: customsClearanceTable.updatedAt }).from(customsClearanceTable).where(eq(customsClearanceTable.dealId, dealId)).limit(1),
      db.select({ id: dealFeedbackTable.id, rating: dealFeedbackTable.rating, comment: dealFeedbackTable.comment, createdAt: dealFeedbackTable.createdAt }).from(dealFeedbackTable).where(and(eq(dealFeedbackTable.dealId, dealId), eq(dealFeedbackTable.status, "approved"))).orderBy(desc(dealFeedbackTable.createdAt)),
    ]);
    res.json({ meetings, cases, customs: customs[0] ?? null, feedback });
  } catch (error) { if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_deal_id" }); return; } res.status(500).json({ error: "deal_execution_fetch_failed" }); }
});

router.post("/deals/:dealId/feedback", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    const input = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1500).optional() }).parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id, buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId, status: dealsTable.status }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), or(eq(dealsTable.buyerUserId, req.authUser!.id), eq(dealsTable.sellerUserId, req.authUser!.id)))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    if (deal.status !== "completed") { res.status(409).json({ error: "feedback_available_after_completion" }); return; }
    const subjectUserId = req.authUser!.id === deal.buyerUserId ? deal.sellerUserId : deal.buyerUserId;
    if (!subjectUserId) { res.status(409).json({ error: "counterparty_missing" }); return; }
    try {
      const [feedback] = await db.insert(dealFeedbackTable).values({ dealId, authorUserId: req.authUser!.id, subjectUserId, rating: String(input.rating), comment: input.comment, status: "pending_review" }).returning();
      await db.insert(auditLogsTable).values({ actorUserId: req.authUser!.id, action: "deal_feedback_submitted", entityType: "deal", entityId: dealId, metadata: { feedbackId: feedback.id, rating: input.rating } });
      res.status(201).json({ feedback: { id: feedback.id, rating: feedback.rating, comment: feedback.comment, status: feedback.status } });
    } catch { res.status(409).json({ error: "feedback_already_submitted" }); }
  } catch (error) { if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; } res.status(500).json({ error: "feedback_submit_failed" }); }
});

router.get("/deals", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const deals = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
        productId: dealsTable.productId,
        quantity: dealsTable.quantity,
        unit: dealsTable.unit,
        agreedPrice: dealsTable.agreedPrice,
        currency: dealsTable.currency,
        incoterm: dealsTable.incoterm,
        destination: dealsTable.destination,
        status: dealsTable.status,
        createdAt: dealsTable.createdAt,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(dealAccess(req.authUser!.id, req.authUser!.role))
      .orderBy(desc(dealsTable.updatedAt));

    res.json({ deals });
  } catch {
    res.status(500).json({ error: "deals_fetch_failed" });
  }
});

router.get("/deals/:dealId", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
        productId: dealsTable.productId,
        quantity: dealsTable.quantity,
        unit: dealsTable.unit,
        agreedPrice: dealsTable.agreedPrice,
        currency: dealsTable.currency,
        incoterm: dealsTable.incoterm,
        destination: dealsTable.destination,
        status: dealsTable.status,
        createdAt: dealsTable.createdAt,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    res.json({ deal });
  } catch {
    res.status(500).json({ error: "deal_fetch_failed" });
  }
});

router.post("/deals/:dealId/ncnda-draft", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    z.object({ confirmTerms: z.literal(true) }).strict().parse(req.body);
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    // Parties remain explicit placeholders until their exact legal names are confirmed.
    const draft = createNcndaDraft({ dealNumber: deal.dealNumber,
      date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date()) });
    await db.insert(auditLogsTable).values({ actorUserId: req.authUser!.id,
      action: "ncnda_draft_generated", entityType: "deal", entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, draftVersion: 1 } });
    res.json({ draft, dealNumber: deal.dealNumber, status: "draft_for_review" });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "terms_confirmation_required_or_invalid_deal_id" }); return; }
    res.status(500).json({ error: "ncnda_draft_generation_failed" });
  }
});

router.post("/deals/:dealId/spa-draft", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  const confirmation = z.object({ confirmTerms: z.literal(true) });
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    confirmation.parse(req.body);
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }

    const [[product], [buyerRequest], [sellerListing]] = await Promise.all([
      db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, deal.productId)).limit(1),
      deal.buyerRequestId
        ? db.select({ companyId: buyerRequestsTable.companyId }).from(buyerRequestsTable).where(eq(buyerRequestsTable.id, deal.buyerRequestId)).limit(1)
        : Promise.resolve([]),
      deal.sellerListingId
        ? db.select({ companyId: sellerListingsTable.companyId }).from(sellerListingsTable).where(eq(sellerListingsTable.id, deal.sellerListingId)).limit(1)
        : Promise.resolve([]),
    ]);
    const [buyerCompany, sellerCompany] = await Promise.all([
      buyerRequest?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, buyerRequest.companyId), eq(companiesTable.ownerUserId, deal.buyerUserId))).limit(1)
        : Promise.resolve([]),
      sellerListing?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, sellerListing.companyId), eq(companiesTable.ownerUserId, deal.sellerUserId))).limit(1)
        : Promise.resolve([]),
    ]);

    const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date());
    const acceptedTerms = await recordedDealTerms(deal.id);
    const draft = createSpaDraft({
      dealNumber: deal.dealNumber,
      date,
      buyerName: buyerCompany[0]?.companyName,
      sellerName: sellerCompany[0]?.companyName,
      productName: product?.name ?? "",
      quantity: deal.quantity,
      unit: deal.unit,
      agreedPrice: deal.agreedPrice,
      currency: deal.currency,
      incoterm: deal.incoterm,
      destination: deal.destination,
      paymentTerms: acceptedTerms?.paymentTerms,
      inspectionTerms: acceptedTerms?.inspectionTerms,
    });
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "spa_draft_generated",
      entityType: "deal",
      entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, draftVersion: 1, termsConfirmedByRequester: true },
    });
    res.json({ draft, dealNumber: deal.dealNumber, status: "draft_for_review" });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "terms_confirmation_required_or_invalid_deal_id" }); return; }
    res.status(500).json({ error: "spa_draft_generation_failed" });
  }
});

router.post("/deals/:dealId/loi-draft", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    z.object({ confirmTerms: z.literal(true) }).parse(req.body);
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal || (req.authUser!.role !== "admin" && req.authUser!.id !== deal.buyerUserId)) {
      res.status(404).json({ error: "deal_not_found" }); return;
    }
    const [[product], [buyerRequest], [sellerListing]] = await Promise.all([
      db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, deal.productId)).limit(1),
      deal.buyerRequestId
        ? db.select({ companyId: buyerRequestsTable.companyId }).from(buyerRequestsTable).where(eq(buyerRequestsTable.id, deal.buyerRequestId)).limit(1)
        : Promise.resolve([]),
      deal.sellerListingId
        ? db.select({ companyId: sellerListingsTable.companyId }).from(sellerListingsTable).where(eq(sellerListingsTable.id, deal.sellerListingId)).limit(1)
        : Promise.resolve([]),
    ]);
    const [buyerCompany, sellerCompany] = await Promise.all([
      buyerRequest?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, buyerRequest.companyId), eq(companiesTable.ownerUserId, deal.buyerUserId))).limit(1)
        : Promise.resolve([]),
      sellerListing?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, sellerListing.companyId), eq(companiesTable.ownerUserId, deal.sellerUserId))).limit(1)
        : Promise.resolve([]),
    ]);
    const acceptedTerms = await recordedDealTerms(deal.id);
    const draft = createLoiDraft({
      dealNumber: deal.dealNumber,
      date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date()),
      buyerName: buyerCompany[0]?.companyName,
      sellerName: sellerCompany[0]?.companyName,
      productName: product?.name ?? "",
      quantity: deal.quantity,
      unit: deal.unit,
      agreedPrice: deal.agreedPrice,
      currency: deal.currency,
      incoterm: deal.incoterm,
      destination: deal.destination,
      paymentTerms: acceptedTerms?.paymentTerms,
      inspectionTerms: acceptedTerms?.inspectionTerms,
    });
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "loi_draft_generated",
      entityType: "deal",
      entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, draftVersion: 1, termsConfirmedByRequester: true },
    });
    res.json({ draft, dealNumber: deal.dealNumber, status: "draft_for_review" });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "terms_confirmation_required_or_invalid_deal_id" }); return; }
    res.status(500).json({ error: "loi_draft_generation_failed" });
  }
});

router.post("/deals/:dealId/icpo-draft", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    z.object({ confirmTerms: z.literal(true) }).parse(req.body);
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal || (req.authUser!.role !== "admin" && req.authUser!.id !== deal.buyerUserId)) {
      res.status(404).json({ error: "deal_not_found" }); return;
    }
    const [[product], [buyerRequest], [sellerListing]] = await Promise.all([
      db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, deal.productId)).limit(1),
      deal.buyerRequestId
        ? db.select({ companyId: buyerRequestsTable.companyId }).from(buyerRequestsTable).where(eq(buyerRequestsTable.id, deal.buyerRequestId)).limit(1)
        : Promise.resolve([]),
      deal.sellerListingId
        ? db.select({ companyId: sellerListingsTable.companyId }).from(sellerListingsTable).where(eq(sellerListingsTable.id, deal.sellerListingId)).limit(1)
        : Promise.resolve([]),
    ]);
    const [buyerCompany, sellerCompany] = await Promise.all([
      buyerRequest?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, buyerRequest.companyId), eq(companiesTable.ownerUserId, deal.buyerUserId))).limit(1)
        : Promise.resolve([]),
      sellerListing?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, sellerListing.companyId), eq(companiesTable.ownerUserId, deal.sellerUserId))).limit(1)
        : Promise.resolve([]),
    ]);
    const acceptedTerms = await recordedDealTerms(deal.id);
    const draft = createIcpoDraft({
      dealNumber: deal.dealNumber,
      date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date()),
      buyerName: buyerCompany[0]?.companyName,
      sellerName: sellerCompany[0]?.companyName,
      productName: product?.name ?? "",
      quantity: deal.quantity,
      unit: deal.unit,
      agreedPrice: deal.agreedPrice,
      currency: deal.currency,
      incoterm: deal.incoterm,
      destination: deal.destination,
      paymentTerms: acceptedTerms?.paymentTerms,
      inspectionTerms: acceptedTerms?.inspectionTerms,
    });
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "icpo_draft_generated",
      entityType: "deal",
      entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, draftVersion: 1, termsConfirmedByRequester: true },
    });
    res.json({ draft, dealNumber: deal.dealNumber, status: "draft_for_review" });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "terms_confirmation_required_or_invalid_deal_id" }); return; }
    res.status(500).json({ error: "icpo_draft_generation_failed" });
  }
});

router.post("/deals/:dealId/fco-draft", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    z.object({ confirmTerms: z.literal(true) }).parse(req.body);
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal || (req.authUser!.role !== "admin" && req.authUser!.id !== deal.sellerUserId)) {
      res.status(404).json({ error: "deal_not_found" }); return;
    }
    const [[product], [buyerRequest], [sellerListing]] = await Promise.all([
      db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, deal.productId)).limit(1),
      deal.buyerRequestId
        ? db.select({ companyId: buyerRequestsTable.companyId }).from(buyerRequestsTable).where(eq(buyerRequestsTable.id, deal.buyerRequestId)).limit(1)
        : Promise.resolve([]),
      deal.sellerListingId
        ? db.select({ companyId: sellerListingsTable.companyId }).from(sellerListingsTable).where(eq(sellerListingsTable.id, deal.sellerListingId)).limit(1)
        : Promise.resolve([]),
    ]);
    const [buyerCompany, sellerCompany] = await Promise.all([
      buyerRequest?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, buyerRequest.companyId), eq(companiesTable.ownerUserId, deal.buyerUserId))).limit(1)
        : Promise.resolve([]),
      sellerListing?.companyId
        ? db.select({ companyName: companiesTable.companyName }).from(companiesTable)
            .where(and(eq(companiesTable.id, sellerListing.companyId), eq(companiesTable.ownerUserId, deal.sellerUserId))).limit(1)
        : Promise.resolve([]),
    ]);
    const acceptedTerms = await recordedDealTerms(deal.id);
    const draft = createFcoDraft({
      dealNumber: deal.dealNumber,
      date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date()),
      buyerName: buyerCompany[0]?.companyName,
      sellerName: sellerCompany[0]?.companyName,
      productName: product?.name ?? "",
      quantity: deal.quantity,
      unit: deal.unit,
      agreedPrice: deal.agreedPrice,
      currency: deal.currency,
      incoterm: deal.incoterm,
      destination: deal.destination,
      paymentTerms: acceptedTerms?.paymentTerms,
      inspectionTerms: acceptedTerms?.inspectionTerms,
    });
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "fco_draft_generated",
      entityType: "deal",
      entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, draftVersion: 1, termsConfirmedByRequester: true },
    });
    res.json({ draft, dealNumber: deal.dealNumber, status: "draft_for_review" });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "terms_confirmation_required_or_invalid_deal_id" }); return; }
    res.status(500).json({ error: "fco_draft_generation_failed" });
  }
});

router.get("/deals/:dealId/tracking", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber, status: dealsTable.status })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    const [inspections, shipments, events, cargoUnits] = await Promise.all([
      db
        .select({
          id: inspectionsTable.id,
          inspectorName: inspectionsTable.inspectorName,
          status: inspectionsTable.status,
          scheduledAt: inspectionsTable.scheduledAt,
          resultSummary: inspectionsTable.resultSummary,
          updatedAt: inspectionsTable.updatedAt,
        })
        .from(inspectionsTable)
        .where(eq(inspectionsTable.dealId, deal.id))
        .orderBy(desc(inspectionsTable.updatedAt)),
      db
        .select({
          id: shipmentsTable.id,
          carrier: shipmentsTable.carrier,
          trackingNumber: shipmentsTable.trackingNumber,
          status: shipmentsTable.status,
          origin: shipmentsTable.origin,
          destination: shipmentsTable.destination,
          estimatedArrival: shipmentsTable.estimatedArrival,
          notes: shipmentsTable.notes,
          updatedAt: shipmentsTable.updatedAt,
        })
        .from(shipmentsTable)
        .where(eq(shipmentsTable.dealId, deal.id))
        .orderBy(desc(shipmentsTable.updatedAt)),
      db.select({
        id:shipmentTrackingEventsTable.id,shipmentId:shipmentTrackingEventsTable.shipmentId,
        kind:shipmentTrackingEventsTable.kind,shipmentStatus:shipmentTrackingEventsTable.shipmentStatus,
        location:shipmentTrackingEventsTable.location,note:shipmentTrackingEventsTable.note,
        source:shipmentTrackingEventsTable.source,sourceReference:shipmentTrackingEventsTable.sourceReference,
        occurredAt:shipmentTrackingEventsTable.occurredAt,createdAt:shipmentTrackingEventsTable.createdAt,
      }).from(shipmentTrackingEventsTable).where(eq(shipmentTrackingEventsTable.dealId,deal.id))
        .orderBy(desc(shipmentTrackingEventsTable.occurredAt)).limit(100),
      db.select({
        id:shipmentCargoUnitsTable.id,shipmentId:shipmentCargoUnitsTable.shipmentId,
        transportMode:shipmentCargoUnitsTable.transportMode,
        unitReference:shipmentCargoUnitsTable.unitReference,
        status:shipmentCargoUnitsTable.status,vesselName:shipmentCargoUnitsTable.vesselName,
        voyageNumber:shipmentCargoUnitsTable.voyageNumber,
        flightNumber:shipmentCargoUnitsTable.flightNumber,
        vehicleReference:shipmentCargoUnitsTable.vehicleReference,
        billOfLading:shipmentCargoUnitsTable.billOfLading,
        airWaybill:shipmentCargoUnitsTable.airWaybill,
        currentLocation:shipmentCargoUnitsTable.currentLocation,
        lastUpdateSource:shipmentCargoUnitsTable.lastUpdateSource,
        lastReportedAt:shipmentCargoUnitsTable.lastReportedAt,
        estimatedArrival:shipmentCargoUnitsTable.estimatedArrival,
        updatedAt:shipmentCargoUnitsTable.updatedAt,
      }).from(shipmentCargoUnitsTable)
        .where(eq(shipmentCargoUnitsTable.dealId,deal.id))
        .orderBy(shipmentCargoUnitsTable.createdAt).limit(100),
    ]);

    // Agents receive milestones and ETAs only; no location, carrier identifiers,
    // free-form notes, source references or inspection evidence from this endpoint.
    const assignedAgent=req.authUser!.role==="agent";
    res.json({
      deal,inspections:assignedAgent?inspections.map(i=>({
        id:i.id,status:i.status,scheduledAt:i.scheduledAt,updatedAt:i.updatedAt,
      })):inspections,
      shipments:assignedAgent?shipments.map(item=>({
        id:item.id,status:item.status,estimatedArrival:item.estimatedArrival,updatedAt:item.updatedAt,
      })):shipments,
      events:assignedAgent?events.map(event=>({
        id:event.id,shipmentId:event.shipmentId,kind:event.kind,
        shipmentStatus:event.shipmentStatus,occurredAt:event.occurredAt,createdAt:event.createdAt,
      })):events,
      cargoUnits:assignedAgent?cargoUnits.map(unit=>({
        id:unit.id,shipmentId:unit.shipmentId,transportMode:unit.transportMode,
        status:unit.status,estimatedArrival:unit.estimatedArrival,
        etaAdvisory:etaAdvisory(unit.status,unit.estimatedArrival,unit.lastReportedAt),
      })):cargoUnits.map(unit=>({
        ...unit,etaAdvisory:etaAdvisory(unit.status,unit.estimatedArrival,unit.lastReportedAt),
      })),
      sourceDisclosure:"UDC-recorded milestones and cargo details are not live GPS or independently verified carrier feeds",
    });
  } catch {
    res.status(500).json({ error: "deal_tracking_fetch_failed" });
  }
});

router.get("/deals/:dealId/payment-status", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber, status: dealsTable.status })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    const instruments = await db
      .select({
        id: dealFinancialsTable.id,
        instrumentType: dealFinancialsTable.instrumentType,
        status: dealFinancialsTable.status,
        amount: dealFinancialsTable.amount,
        currency: dealFinancialsTable.currency,
        updatedAt: dealFinancialsTable.updatedAt,
      })
      .from(dealFinancialsTable)
      .where(eq(dealFinancialsTable.dealId, deal.id))
      .orderBy(desc(dealFinancialsTable.updatedAt));

    res.json({ deal, instruments });
  } catch {
    res.status(500).json({ error: "payment_status_fetch_failed" });
  }
});

router.get("/deals/:dealId/timeline", requireAuth, requireNonAgentDealAccess, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber })
      .from(dealsTable).where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const events = await db.select({
      action: auditLogsTable.action,
      metadata: auditLogsTable.metadata,
      createdAt: auditLogsTable.createdAt,
    }).from(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "deal"),
      eq(auditLogsTable.entityId, deal.id),
      inArray(auditLogsTable.action, ["deal_created", "deal_status_updated", "inspection_status_updated", "shipment_status_updated", "financial_instrument_status_updated"]),
    )).orderBy(desc(auditLogsTable.createdAt));
    res.json({ deal, events });
  } catch { res.status(500).json({ error: "deal_timeline_fetch_failed" }); }
});

export default router;
