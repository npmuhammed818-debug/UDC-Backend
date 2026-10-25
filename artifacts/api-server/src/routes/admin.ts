import { screenCompanyEvidence, companyProfileFingerprint } from '../akif/companyScreening';
import { verifiedCounterparties, approvedCompanyEvidence } from '../marketplace/verifiedCounterparties';
import { recordedDealTerms } from '../deals/recordedTerms';
import { acceptedMatchTerms, requestTermsReview, AgreementError } from '../marketplace/termAgreement';
import { udcPaymentTerms } from '../marketplace/paymentPolicy';
import { buildDefaultCommissionPreview, TWO_DECIMAL_CURRENCIES } from "../referrals/defaultCommissionRule";
import { calculateCommissionAmount, CommissionCalculationError } from "../referrals/commissionAmount";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { missingPaymentEvidence, paymentMilestoneStages } from "../deals/paymentMilestone";
import { notificationPreferencesTable, auditLogsTable, buyerRequestsTable, commissionsTable, companiesTable, companyVerificationDocumentsTable, dealsTable, dealParticipantsTable, documentAccessTable, documentsTable, inspectionsTable, dealFinancialsTable, matchesTable, shipmentsTable, messagesTable, notificationsTable, productsTable, referralsTable, sellerListingsTable, usersTable, whatsappMessageContextsTable, dealConversationEventsTable, dealMeetingsTable, dealCasesTable, customsClearanceTable, dealFeedbackTable, shipmentTrackingEventsTable, shipmentCargoUnitsTable, whatsappShipmentOutboxTable, vaultAccessLogTable } from "@workspace/db";
import { type AuthenticatedRequest, requireRole } from "../auth/middleware";
import { sendWhatsAppText } from "../whatsapp/client";
import { enqueueShipmentWhatsApp } from "../notifications/shipmentOutbox";
import { reconcileStoredShipmentReceipts } from "../whatsapp/shipmentDeliveryReceipts";
import { runEtaFollowups } from "../tracking/etaFollowups";
import { scoreTradeMatch } from "../marketplace/matchScoring";
import { createSignedDownloadUrl, createSignedUploadUrl, downloadDocumentBytes, parseStoragePath, storagePath } from "../supabase/storage";
import { managedDealDocumentPath, managedCompanyDocumentPath } from "../supabase/documentAccessPath";
import { processDocumentIntelligence, refreshDealIntelligenceSnapshot } from "../akif/documentIntelligence";
import { canAllocateCommissionShare, nextReferralPosition } from "../referrals/agentChain";

const router: IRouter = Router();

async function downgradeCompanyOwner(tx:Pick<typeof db,'select'|'update'|'insert'>,ownerUserId:string,actorUserId:string){
  const [owner]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,ownerUserId)).limit(1);
  if(owner&&['buyer','seller'].includes(owner.role)&&owner.status==='verified'){
    await tx.update(usersTable).set({status:'under_review',updatedAt:new Date()}).where(eq(usersTable.id,ownerUserId));
    await tx.insert(auditLogsTable).values({actorUserId,action:'user_verification_status_updated',entityType:'user',entityId:ownerUserId,metadata:{previousStatus:'verified',newStatus:'under_review',reason:'company_evidence_requires_review'}});
  }
}


async function notifyCompanyOwnerOnWhatsApp(userId:string,body:string){
  const [owner]=await db.select({phone:usersTable.phone,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1);
  if(owner?.phone&&!['suspended','rejected'].includes(owner.status))try{await sendWhatsAppText(owner.phone,body);}catch{/* Review remains recorded; delivery can be retried separately. */}
}


router.get("/admin/analytics", requireRole("admin"), async (_req, res) => {
  try {
    const [stages, completedValues, products, buyerCountries, sellerCountries, commissionPerformance] = await Promise.all([
      db.select({ status: dealsTable.status, count: sql<number>`count(*)::int` })
        .from(dealsTable).groupBy(dealsTable.status),
      db.select({
        currency: dealsTable.currency,
        dealCount: sql<number>`count(*)::int`,
        value: sql<string>`sum(${dealsTable.quantity} * ${dealsTable.agreedPrice})::text`,
      }).from(dealsTable).where(eq(dealsTable.status, "completed"))
        .groupBy(dealsTable.currency),
      db.select({
        product: productsTable.name,
        dealCount: sql<number>`count(*)::int`,
      }).from(dealsTable).innerJoin(productsTable, eq(dealsTable.productId, productsTable.id))
        .groupBy(productsTable.id, productsTable.name)
        .orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ country: usersTable.country, dealCount: sql<number>`count(*)::int` })
        .from(dealsTable).innerJoin(usersTable, eq(dealsTable.buyerUserId, usersTable.id))
        .groupBy(usersTable.country).orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ country: usersTable.country, dealCount: sql<number>`count(*)::int` })
        .from(dealsTable).innerJoin(usersTable, eq(dealsTable.sellerUserId, usersTable.id))
        .groupBy(usersTable.country).orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ currency: commissionsTable.currency, status: commissionsTable.status,
        count: sql<number>`count(*)::int`, amount: sql<string>`sum(${commissionsTable.amount})::text` })
        .from(commissionsTable).groupBy(commissionsTable.currency, commissionsTable.status),
    ]);
    res.json({ stages, completedValues, products, buyerCountries, sellerCountries, commissionPerformance });
  } catch {
    res.status(500).json({ error: "analytics_fetch_failed" });
  }
});

const announcementInput = z.object({
  audience: z.enum(["buyer", "seller", "agent"]),
  title: z.string().trim().min(3).max(100),
  body: z.string().trim().min(5).max(1000),
}).strict();

router.post("/admin/announcements", requireRole("admin"), async (req, res) => {
  try {
    const input = announcementInput.parse(req.body);
    const recipients = await db.select({ id: usersTable.id }).from(usersTable)
      .innerJoin(notificationPreferencesTable, eq(notificationPreferencesTable.userId, usersTable.id))
      .where(and(eq(usersTable.role, input.audience), inArray(usersTable.status, ["verified", "active"]), eq(notificationPreferencesTable.optionalInApp, true), eq(notificationPreferencesTable.announcements, true)))
      .limit(1001);
    if (recipients.length > 1000) {
      res.status(409).json({ error: "audience_too_large" }); return;
    }
    if (!recipients.length) {
      res.status(409).json({ error: "no_active_recipients" }); return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(notificationsTable).values(recipients.map((recipient) => ({
        userId: recipient.id,
        type: "announcement",
        title: input.title,
        body: input.body,
        link: "/notifications",
      })));
      await tx.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "announcement_created",
        entityType: "announcement",
        metadata: { audience: input.audience, recipientCount: recipients.length, title: input.title },
      });
    });
    res.status(201).json({ recipientCount: recipients.length });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "announcement_create_failed" });
  }
});

router.get("/admin/audit-log", requireRole("admin"), async (req, res) => {
  const querySchema = z.object({
    q: z.string().trim().max(100).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(5000).default(0),
  });
  try {
    const { q, entityType, limit, offset } = querySchema.parse(req.query);
    const conditions = [
      entityType ? eq(auditLogsTable.entityType, entityType) : undefined,
      q ? or(ilike(auditLogsTable.action, `%${q}%`), ilike(auditLogsTable.entityType, `%${q}%`), ilike(usersTable.fullName, `%${q}%`), ilike(usersTable.email, `%${q}%`)) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);
    const rows = await db.select({
      id: auditLogsTable.id,
      actorUserId: auditLogsTable.actorUserId,
      actorName: usersTable.fullName,
      actorEmail: usersTable.email,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      metadata: auditLogsTable.metadata,
      createdAt: auditLogsTable.createdAt,
    }).from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.actorUserId, usersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
      .limit(limit + 1)
      .offset(offset);
    const hasMore = rows.length > limit;
    res.json({ logs: rows.slice(0, limit), hasMore, nextOffset: hasMore ? offset + limit : null });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "audit_log_fetch_failed" });
  }
});

const verificationSchema = z.object({
  verification_status: z.enum(["pending", "under_review", "verified", "rejected"]),
});

router.get("/admin/companies/pending-verification", requireRole("admin"), async (_req, res) => {
  try {
    const companies = await db.select({
      id: companiesTable.id,
      ownerUserId: companiesTable.ownerUserId,
      companyName: companiesTable.companyName,
      registrationNumber: companiesTable.registrationNumber,
      country: companiesTable.country,
      address: companiesTable.address,
      website: companiesTable.website,
      verificationStatus: companiesTable.verificationStatus,
      ownerName: usersTable.fullName,
      ownerEmail: usersTable.email,
      ownerRole: usersTable.role,
    }).from(companiesTable)
      .innerJoin(usersTable, eq(companiesTable.ownerUserId, usersTable.id))
      .where(inArray(companiesTable.verificationStatus, ["pending", "under_review"]))
      .orderBy(desc(companiesTable.updatedAt));
    res.json({ companies });
  } catch {
    res.status(500).json({ error: "pending_companies_fetch_failed" });
  }
});

router.get("/admin/company-verification-documents", requireRole("admin"), async (_req: AuthenticatedRequest, res) => {
  try {
    const rows = await db.select({
      id: companyVerificationDocumentsTable.id,
      companyId: companyVerificationDocumentsTable.companyId,
      companyName: companiesTable.companyName,
      registrationNumber:companiesTable.registrationNumber,
      country:companiesTable.country,
      ownerName: usersTable.fullName,
      ownerEmail: usersTable.email,
      documentType: companyVerificationDocumentsTable.documentType,
      fileUrl: companyVerificationDocumentsTable.fileUrl,
      status: companyVerificationDocumentsTable.status,
      reviewNote: companyVerificationDocumentsTable.reviewNote,
      createdAt: companyVerificationDocumentsTable.createdAt,
    }).from(companyVerificationDocumentsTable)
      .innerJoin(companiesTable, eq(companyVerificationDocumentsTable.companyId, companiesTable.id))
      .innerJoin(usersTable, eq(companiesTable.ownerUserId, usersTable.id))
      .orderBy(desc(companyVerificationDocumentsTable.createdAt));
    const adminActorId = _req.authUser?.id ?? null;
    res.json({ documents: await Promise.all(rows.map(async (item) => {
      const [screening]=await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.entityId,item.id),eq(auditLogsTable.action,'company_document_screened'))).orderBy(desc(auditLogsTable.createdAt)).limit(1);
      const ownedPath = managedCompanyDocumentPath(item.fileUrl,item.companyId);
      return { ...item, screening:(screening?.metadata as any)?.profileFingerprint===companyProfileFingerprint(item)?screening!.metadata:null, fileUrl: ownedPath ? (await db.insert(vaultAccessLogTable).values({ actorUserId: adminActorId, actorRole: "admin_reviewer", action: "review_link_signed", documentId: item.id }), await createSignedDownloadUrl(ownedPath)) : null };
    })) });
  } catch { res.status(500).json({ error: "company_verification_documents_fetch_failed" }); }
});

router.post("/admin/company-verification-documents/:documentId/analyze", requireRole("admin"), async(req,res)=>{
  try {
    const documentId=z.string().uuid().parse(req.params.documentId);
    const [document]=await db.select().from(companyVerificationDocumentsTable).where(eq(companyVerificationDocumentsTable.id,documentId)).limit(1);
    if(!document){res.status(404).json({error:'company_document_not_found'});return;}
    const [company]=await db.select().from(companiesTable).where(eq(companiesTable.id,document.companyId)).limit(1);
    if(!company){res.status(404).json({error:'company_not_found'});return;}
    const profileFingerprint=companyProfileFingerprint(company);
    const cached=await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'company_screening:'+documentId}))`);
      const [previous]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId,documentId),eq(auditLogsTable.action,'company_document_screened'))).orderBy(desc(auditLogsTable.createdAt)).limit(1);
      if((previous?.metadata as any)?.profileFingerprint===profileFingerprint)return previous!.metadata;
      const [running]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId,documentId),eq(auditLogsTable.action,'company_document_screening_started'))).orderBy(desc(auditLogsTable.createdAt)).limit(1);
      if(running&&(running.metadata as any)?.profileFingerprint===profileFingerprint&&Date.now()-new Date(running.createdAt).getTime()<5*60_000)return {inProgress:true};
      await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'company_document_screening_started',entityType:'company_verification_document',entityId:documentId,metadata:{manualAdminRequest:true,profileFingerprint}});
      return null;
    });
    if(cached){res.status((cached as any).inProgress?202:200).json({screening:cached});return;}
    const screening={...await screenCompanyEvidence(document,company),profileFingerprint};
    await db.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'company_document_screened',entityType:'company_verification_document',entityId:documentId,metadata:screening});
    res.json({screening});
  } catch(error){res.status(error instanceof z.ZodError?400:503).json({error:'company_screening_unavailable_manual_review_required'});}
});

router.patch("/admin/company-verification-documents/:documentId/status", requireRole("admin"), async (req, res) => {
  const schema = z.object({ status: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(1000).optional() }).superRefine((input, context) => {
    if (input.status === "rejected" && !input.reviewNote) {
      context.addIssue({ code: "custom", path: ["reviewNote"], message: "A reason is required when rejecting company evidence." });
    }
  });
  try {
    const input = schema.parse(req.body);
    const documentId = z.string().uuid().parse(req.params["documentId"]);
    const result=await db.transaction(async tx=>{
      const [lookup]=await tx.select({companyId:companyVerificationDocumentsTable.companyId}).from(companyVerificationDocumentsTable).where(eq(companyVerificationDocumentsTable.id,documentId)).limit(1);
      if(!lookup)return {error:'company_document_not_found',status:404} as const;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'company_verification:'+lookup.companyId}))`);
      const [existing]=await tx.select().from(companyVerificationDocumentsTable).where(eq(companyVerificationDocumentsTable.id,documentId)).limit(1);
      if(!existing)return {error:'company_document_not_found',status:404} as const;
      const [company]=await tx.select().from(companiesTable).where(eq(companiesTable.id,existing.companyId)).limit(1);
      if(!company)return {error:'company_not_found',status:404} as const;
      const changed=existing.status!==input.status;
      if(!changed&&(existing.reviewNote||null)===(input.reviewNote||null))return {document:existing,ownerUserId:company.ownerUserId,changed:false};
      const [document]=await tx.update(companyVerificationDocumentsTable).set({status:input.status,reviewNote:input.reviewNote||null,reviewedBy:req.authUser!.id,reviewedAt:new Date(),updatedAt:new Date()}).where(eq(companyVerificationDocumentsTable.id,documentId)).returning();
      await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'company_verification_document_reviewed',entityType:'company_verification_document',entityId:document.id,metadata:{companyId:company.id,previousStatus:existing.status,newStatus:document.status,reviewNote:document.reviewNote}});
      if(input.status==='rejected'&&company.verificationStatus==='verified'){
        const [remaining]=await tx.select({id:companyVerificationDocumentsTable.id}).from(companyVerificationDocumentsTable).where(and(eq(companyVerificationDocumentsTable.companyId,company.id),eq(companyVerificationDocumentsTable.status,'approved'))).limit(1);
        if(!remaining){await tx.update(companiesTable).set({verificationStatus:'under_review',updatedAt:new Date()}).where(eq(companiesTable.id,company.id));await downgradeCompanyOwner(tx,company.ownerUserId,req.authUser!.id);await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'company_verification_status_updated',entityType:'company',entityId:company.id,metadata:{previousStatus:'verified',newStatus:'under_review',reason:'approved_evidence_rejected'}});}
      }
      if(changed)await tx.insert(notificationsTable).values({userId:company.ownerUserId,type:'company_verification_document_reviewed',title:'Company evidence reviewed',body:`Your company document was ${document.status}.${document.reviewNote?` Note: ${document.reviewNote}`:''} Check your verification status.`,link:'/profile'});
      return {document,ownerUserId:company.ownerUserId,changed};
    },{isolationLevel:'serializable'});
    if('error' in result){res.status(result.status ?? 500).json({error:result.error});return;}
    if(result.changed)await notifyCompanyOwnerOnWhatsApp(result.ownerUserId,`Your company document was ${result.document.status} by UDC.${result.document.reviewNote?` Note: ${result.document.reviewNote}`:''} Type Menu to check your account and company verification status.`);
    res.json({document:result.document});
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error", details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }); return; }
    res.status(500).json({ error: "company_document_review_failed" });
  }
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
      const result=await db.transaction(async tx=>{
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'company_verification:'+companyId}))`);
        const [existing]=await tx.select().from(companiesTable).where(eq(companiesTable.id,companyId)).limit(1);
        if(!existing)return {error:'company_not_found',status:404} as const;
        if(verification_status==='verified'){
          const [approved]=await tx.select({id:companyVerificationDocumentsTable.id}).from(companyVerificationDocumentsTable).where(and(eq(companyVerificationDocumentsTable.companyId,companyId),eq(companyVerificationDocumentsTable.status,'approved'))).limit(1);
          if(!approved)return {error:'approved_company_document_required',status:409} as const;
        }
        if(existing.verificationStatus===verification_status)return {company:existing,ownerUserId:existing.ownerUserId,changed:false};
        const [company]=await tx.update(companiesTable).set({verificationStatus:verification_status,updatedAt:new Date()}).where(eq(companiesTable.id,companyId)).returning();
        await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'company_verification_status_updated',entityType:'company',entityId:companyId,metadata:{previousStatus:existing.verificationStatus,newStatus:verification_status}});
        if(verification_status!=='verified')await downgradeCompanyOwner(tx,existing.ownerUserId,req.authUser!.id);
        await tx.insert(notificationsTable).values({userId:existing.ownerUserId,type:'company_verification_status_updated',title:'Company verification updated',body:`Your company verification status is now ${verification_status}.`,link:'/company'});
        return {company,ownerUserId:existing.ownerUserId,changed:true};
      },{isolationLevel:'serializable'});
      if('error' in result){res.status(result.status ?? 500).json({error:result.error});return;}
      if(result.changed)await notifyCompanyOwnerOnWhatsApp(result.ownerUserId,`Your company review status is now ${result.company.verificationStatus}. Type Menu to check your account and company verification status.`);
      res.json({company:result.company});
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
  confirmDestinationSgs: z.boolean().optional(),
  confirmAlternativePaymentReview: z.boolean().optional(),
  paymentEvidenceDocumentId: z.string().uuid().optional(),
});

const createCommissionSchema = z.object({
  dealId: z.string().uuid(),
  beneficiaryUserId: z.string().uuid(),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(?:\.\d{1,6})?$/)]).optional(),
  currency: z.string().length(3).optional(),
  commissionType: z.enum(["percentage", "fixed_per_mt", "fixed_amount"]).optional(),
  commissionRate: z.union([z.number().nonnegative(), z.string().regex(/^\d+(?:\.\d{1,4})?$/)]).optional(),
  confirmAgreedTerms: z.boolean().optional(),
});

const commissionStatusSchema = z.object({
  status: z.enum(["pending", "paid", "cancelled"]),
});

const createDocumentSchema = z.object({
  dealId: z.string().uuid(),
  documentType: z.string().min(2).max(80),
  fileUrl: z.string().max(550),
}).refine((value)=>managedDealDocumentPath(value.fileUrl,value.dealId)!==null,{
  message:"document_path_must_belong_to_deal",
  path:["fileUrl"],
});

const documentStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().min(5).max(1000).optional(),
}).superRefine((value, context) => {
  if (value.status === "rejected" && !value.reviewNote) {
    context.addIssue({ code: "custom", path: ["reviewNote"], message: "A rejection reason is required" });
  }
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
  status: z.enum(["pending", "qualified", "cancelled"]),
});

const addAgentParticipantSchema = z.object({
  userId: z.string().uuid(),
  referredByAgentUserId: z.string().uuid().optional(),
  commissionSharePct: z.coerce.number().min(0).max(100).optional(),
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
const cargoUnitSchema=z.object({
  transportMode:z.enum(["sea","air","road"]),
  unitReference:z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9\-_/ ]*$/),
  vesselName:z.string().trim().min(2).max(120).optional(),
  voyageNumber:z.string().trim().min(2).max(80).optional(),
  flightNumber:z.string().trim().min(2).max(60).optional(),
  vehicleReference:z.string().trim().min(2).max(80).optional(),
  billOfLading:z.string().trim().min(2).max(100).optional(),
  airWaybill:z.string().trim().min(2).max(100).optional(),
  estimatedArrival:z.coerce.date().optional(),
}).superRefine((v,ctx)=>{
  if(v.transportMode==="sea" && (v.flightNumber||v.airWaybill||v.vehicleReference))
    ctx.addIssue({code:"custom",path:["transportMode"],message:"Sea cargo must not contain air or road references"});
  if(v.transportMode==="air" && (v.vesselName||v.voyageNumber||v.billOfLading||v.vehicleReference))
    ctx.addIssue({code:"custom",path:["transportMode"],message:"Air cargo must not contain sea or road references"});
  if(v.transportMode==="road" && (v.vesselName||v.voyageNumber||v.billOfLading||v.flightNumber||v.airWaybill))
    ctx.addIssue({code:"custom",path:["transportMode"],message:"Road cargo must not contain sea or air references"});
});
const cargoUnitUpdateSchema=z.object({
  status:z.enum(["planned","booked","in_transit","arrived","delivered","cancelled","on_hold"]),
  currentLocation:z.string().trim().min(2).max(160).optional(),
  estimatedArrival:z.coerce.date().optional(),
});
const shipmentMilestoneSchema=z.object({
  idempotencyKey:z.string().uuid(),
  kind:z.enum(["planned","booked","departed","in_transit","arrived","customs","inspection","delivered","delay","exception","status_update"]),
  occurredAt:z.coerce.date(),
  location:z.string().trim().min(2).max(160).optional(),
  note:z.string().trim().min(3).max(500).optional(),
  source:z.enum(["udc_manual","carrier_reported","document_checked"]).default("udc_manual"),
  sourceReference:z.string().trim().min(2).max(160).optional(),
}).superRefine((value,ctx)=>{
  if(value.source!=="udc_manual"&&!value.sourceReference)
    ctx.addIssue({code:"custom",path:["sourceReference"],message:"A carrier or document source reference is required."});
  if(value.occurredAt.getTime()>Date.now()+5*60_000)
    ctx.addIssue({code:"custom",path:["occurredAt"],message:"Future events are not recorded as completed milestones."});
});


const createFinancialInstrumentSchema = z.object({
  dealId: z.string().uuid(),
  instrumentType: z.literal("DLC").default("DLC"),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().length(3).optional(),
  reference: z.string().max(160).optional(),
  provider: z.string().max(160).optional(),
});

const financialInstrumentStatusSchema = z.object({
  status: z.enum(["not_started", "requested", "pending", "received", "confirmed", "rejected", "cancelled"]),
  reference: z.string().max(160).optional(),
  provider: z.string().max(160).optional(),
});

const hasVerifiedCounterparties = verifiedCounterparties;

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

  // Shipment alerts must not use both the old direct-send path and the
  // transactional outbox. The queue has NO active production dispatcher.
  if(type.startsWith("shipment_")||type==="cargo_unit_status_updated"){
    await db.transaction(async tx=>{
      const notices=await tx.insert(notificationsTable).values([
        {userId:deal.buyerUserId,type,title,body,link},
        {userId:deal.sellerUserId,type,title,body,link},
      ]).returning({id:notificationsTable.id,userId:notificationsTable.userId});
      for(const notice of notices)
        await enqueueShipmentWhatsApp(tx,{
          notificationId:notice.id,dealId,recipientUserId:notice.userId,
        });
    });
    return;
  }

  await db.insert(notificationsTable).values([
    { userId: deal.buyerUserId, type, title, body, link },
    { userId: deal.sellerUserId, type, title, body, link },
  ]);

  const counterparties = await db
    .select({ id: usersTable.id, phone: usersTable.phone })
    .from(usersTable)
    .where(inArray(usersTable.id, [deal.buyerUserId, deal.sellerUserId]));

  await Promise.all(counterparties.map(async (counterparty) => {
    if (!counterparty.phone) return;
    try {
      const delivery = await sendWhatsAppText(counterparty.phone, body);
      if (delivery.messageId) {
        await db.insert(whatsappMessageContextsTable)
          .values({
            providerMessageId: delivery.messageId,
            dealId,
            recipientUserId: counterparty.id,
            kind: type,
          })
          .onConflictDoNothing();
      }
    } catch {
      // WhatsApp delivery failure must not roll back the underlying trade workflow.
    }
  }));
}

// Explicit operator-triggered scan; safe in CI and staging because it queues only
// in-app follow-ups. The autonomous runner is a separately gated deployment opt-in.
// Read-only operator view. Accepted means Meta acknowledged, not delivered.
// Never return phone numbers, chat content, identity proofs or access tokens.
// Admin-only metadata reconciliation for previously signed Meta receipts.
// Zero provider calls; cannot send or retry a WhatsApp message.
router.post("/admin/notifications/whatsapp-shipment-receipts/reconcile",
  requireRole("admin"),async(_req,res)=>{
    try{res.json(await reconcileStoredShipmentReceipts());}
    catch{res.status(503).json({error:"shipment_receipt_reconciliation_unavailable"});}
  });

router.get("/admin/notifications/whatsapp-shipment-outbox",requireRole("admin"),async(req,res)=>{
  try{
    const status=z.enum(["pending","leased","retry","accepted","uncertain","cancelled","failed","blocked"])
      .optional().parse(req.query.status);
    const rows=await db.select({
      id:whatsappShipmentOutboxTable.id,
      notificationId:whatsappShipmentOutboxTable.notificationId,
      dealId:whatsappShipmentOutboxTable.dealId,
      status:whatsappShipmentOutboxTable.status,
      attempts:whatsappShipmentOutboxTable.attempts,
      deliveryStatus:whatsappShipmentOutboxTable.deliveryStatus,
      deliveredAt:whatsappShipmentOutboxTable.deliveredAt,
      readAt:whatsappShipmentOutboxTable.readAt,
      failedAt:whatsappShipmentOutboxTable.failedAt,
      lastFailureCategory:whatsappShipmentOutboxTable.lastFailureCategory,
      nextAttemptAt:whatsappShipmentOutboxTable.nextAttemptAt,
      updatedAt:whatsappShipmentOutboxTable.updatedAt,
    }).from(whatsappShipmentOutboxTable)
      .where(status?eq(whatsappShipmentOutboxTable.status,status):undefined)
      .orderBy(desc(whatsappShipmentOutboxTable.updatedAt)).limit(100);
    res.json({entries:rows,providerAcceptanceDoesNotEqualDelivered:true});
  }catch(error){
    if(error instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}
    res.status(500).json({error:"outbox_list_failed"});
  }
});

router.post("/admin/tracking/eta-followups/run",requireRole("admin"),async(req:AuthenticatedRequest,res)=>{
  try{
    const result=await runEtaFollowups({actorUserId:req.authUser!.id});
    res.json(result);
  }catch{
    res.status(500).json({error:"eta_followup_run_failed"});
  }
});

router.post("/admin/deal-escalations/run", requireRole("admin"), async (req, res) => {
  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const terminal = ["completed", "cancelled", "rejected"];
    const deals = await db.select().from(dealsTable)
      .where(and(sql`${dealsTable.status} not in (${sql.join(terminal.map((s) => sql`${s}`), sql`, `)})`, sql`${dealsTable.updatedAt} < ${staleBefore}`))
      .orderBy(dealsTable.updatedAt)
      .limit(250);

    let created = 0;
    for (const deal of deals) {
      const dayKey = now.toISOString().slice(0, 10);
      const type = `deal_escalation:${deal.status}:${dayKey}`;
      const existing = await db.select({ id: notificationsTable.id }).from(notificationsTable)
        .where(and(inArray(notificationsTable.userId, [deal.buyerUserId, deal.sellerUserId]), eq(notificationsTable.type, type), eq(notificationsTable.link, `/deals/${deal.id}`)))
        .limit(1);
      if (existing.length) continue;

      const title = `Action check: ${deal.dealNumber}`;
      const body = `Your UDC deal is still at ${deal.status.replaceAll("_", " ")}. Reply here for the next required action.`;
      await notifyDealCounterparties(deal.id, type, title, body, `/deals/${deal.id}`);
      created += 2;
      await db.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "deal_escalation_created",
        entityType: "deal",
        entityId: deal.id,
        metadata: { stage: deal.status, staleHours: 48, notificationType: type },
      });
    }
    res.json({ scanned: deals.length, notificationsCreated: created });
  } catch {
    res.status(500).json({ error: "deal_escalation_run_failed" });
  }
});

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

router.get("/admin/matches", requireRole("admin"), async (_req, res) => {
  const matches = await db.select().from(matchesTable).orderBy(desc(matchesTable.updatedAt));
  res.json({ matches });
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

    const [existingMatch] = await db.select({ id: matchesTable.id, status: matchesTable.status }).from(matchesTable).where(and(
      eq(matchesTable.buyerRequestId, buyerRequest.id),
      eq(matchesTable.sellerListingId, sellerOffer.id),
    )).limit(1);
    if (existingMatch && existingMatch.status !== "suggested") {
      res.status(409).json({ error: "match_already_exists", matchId: existingMatch.id });
      return;
    }

    const [match] = existingMatch ? await db.update(matchesTable).set({status:"approved",updatedAt:new Date()}).where(eq(matchesTable.id,existingMatch.id)).returning() : await db.insert(matchesTable).values({
      buyerRequestId: buyerRequest.id,
      sellerListingId: sellerOffer.id,
      matchScore: String(scoreTradeMatch(buyerRequest, sellerOffer).score),
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

router.post("/admin/matches/:matchId/terms-review", requireRole("admin"), async (req,res)=>{
 try {const matchId=z.string().uuid().parse(req.params.matchId);res.json(await requestTermsReview(matchId,req.authUser!.id));}
 catch(error){res.status(error instanceof z.ZodError?400:error instanceof AgreementError?409:500).json({error:error instanceof AgreementError?error.message:'terms_review_failed'});}
});

router.post("/admin/deals", requireRole("admin"), async (req, res) => {
  try {
    const input = createDealSchema.parse(req.body);
    const deal=await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'match_terms:'+input.matchId}))`);
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, input.matchId)).limit(1);
    if (!match || match.status !== "approved") {
      throw new AgreementError("deal_requires_approved_match");
    }

    const [buyerRequest] = await tx.select().from(buyerRequestsTable).where(eq(buyerRequestsTable.id, match.buyerRequestId)).limit(1);
    const [sellerOffer] = await tx.select().from(sellerListingsTable).where(eq(sellerListingsTable.id, match.sellerListingId)).limit(1);
    if (!buyerRequest || !sellerOffer || buyerRequest.status !== "approved" || sellerOffer.status !== "approved") {
      throw new AgreementError("deal_records_require_admin_approval");
    }
    if (buyerRequest.productId !== sellerOffer.productId || buyerRequest.unit !== sellerOffer.unit) {
      throw new AgreementError("deal_terms_do_not_match");
    }
    if (!await hasVerifiedCounterparties(buyerRequest.buyerUserId, sellerOffer.sellerUserId, tx)) {
      throw new AgreementError("deal_requires_verified_counterparties");
    }

    const agreedTerms = await acceptedMatchTerms(tx, match.id, buyerRequest, sellerOffer);
    const [requiresReview]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.entityId,match.id),inArray(auditLogsTable.action,['match_terms_proposed','automatic_rematch_selected','automatic_match_selected']))).limit(1);
    if (((sellerOffer.paymentTerms || udcPaymentTerms) !== udcPaymentTerms || requiresReview) && !agreedTerms) {
      throw new AgreementError("explicit_buyer_terms_agreement_required");
    }
    if (agreedTerms && (Number(agreedTerms.quantity)!==input.quantity || Number(agreedTerms.price)!==input.agreedPrice
      || agreedTerms.currency.toUpperCase()!==(input.currency??sellerOffer.currency).toUpperCase()
      || agreedTerms.incoterm!==(input.incoterm??sellerOffer.incoterm??buyerRequest.preferredIncoterm??null)
      || agreedTerms.destination!==(input.destination??agreedTerms.destination))) {
      throw new AgreementError("deal_differs_from_buyer_accepted_terms");
    }

    const [existingDeal] = await tx.select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber })
      .from(dealsTable)
      .where(and(eq(dealsTable.buyerRequestId, buyerRequest.id), eq(dealsTable.sellerListingId, sellerOffer.id)))
      .limit(1);
    if (existingDeal) {
      throw new AgreementError("deal_already_exists");
    }

    const [deal] = await tx.insert(dealsTable).values({
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
      destination: input.destination ?? agreedTerms?.destination ?? buyerRequest.destination ?? sellerOffer.destination,
      dealValue: String(input.quantity * input.agreedPrice),
      status: "initiated",
    }).returning();
    await tx.insert(dealParticipantsTable).values([
      { dealId: deal.id, userId: deal.buyerUserId, participantRole: "buyer", status: "active" },
      { dealId: deal.id, userId: deal.sellerUserId, participantRole: "seller", status: "active" },
    ]);
    await tx.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id, action: "deal_created", entityType: "deal", entityId: deal.id,
      metadata: { dealNumber: deal.dealNumber, buyerUserId: deal.buyerUserId, sellerUserId: deal.sellerUserId, agreedTerms: agreedTerms ?? null },
    });
      return deal;
    },{isolationLevel:"serializable"});
    await notifyDealCounterparties(
      deal.id,
      "deal_created",
      "New UDC deal created",
      `We’ve opened the deal. ${deal.quantity} ${deal.unit} at ${deal.currency} ${deal.agreedPrice}/${deal.unit} to ${deal.destination ?? "the agreed destination"}. We’re at ${deal.status} now.`,
      `/deals/${deal.id}`,
    );
    res.status(201).json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    if(error instanceof AgreementError){res.status(409).json({error:error.message});return;}
    res.status(500).json({ error: "deal_creation_failed" });
  }
});

router.get("/admin/referrals", requireRole("admin"), async (_req, res) => {
  const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.updatedAt));
  res.json({ referrals });
});

router.get("/admin/users", requireRole("admin"), async (_req, res) => {
  const users = await db.select({
    id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email,
    role: usersTable.role, status: usersTable.status,
  }).from(usersTable).orderBy(desc(usersTable.createdAt)).limit(500);
  res.json({ users });
});

router.post("/admin/referrals", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = createReferralSchema.parse(req.body);
    const [[agent], [referred]] = await Promise.all([
      db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, input.agentUserId)).limit(1),
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, input.referredUserId)).limit(1),
    ]);
    if (agent?.role !== "agent" || !referred || agent.id === referred.id) { res.status(409).json({ error: "invalid_referral_parties" }); return; }
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

router.get("/admin/deals/:dealId/room", requireRole("admin"), async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const [participants, messages, documents, financials, inspections, shipments, customs, meetings, cases, commissions, timeline] = await Promise.all([
      db.select().from(dealParticipantsTable).where(eq(dealParticipantsTable.dealId, dealId)),
      db.select().from(messagesTable).where(eq(messagesTable.dealId, dealId)).orderBy(desc(messagesTable.createdAt)).limit(200),
      db.select().from(documentsTable).where(eq(documentsTable.dealId, dealId)).orderBy(desc(documentsTable.createdAt)),
      db.select().from(dealFinancialsTable).where(eq(dealFinancialsTable.dealId, dealId)).orderBy(desc(dealFinancialsTable.updatedAt)),
      db.select().from(inspectionsTable).where(eq(inspectionsTable.dealId, dealId)).orderBy(desc(inspectionsTable.updatedAt)),
      db.select().from(shipmentsTable).where(eq(shipmentsTable.dealId, dealId)).orderBy(desc(shipmentsTable.updatedAt)),
      db.select().from(customsClearanceTable).where(eq(customsClearanceTable.dealId, dealId)).limit(1),
      db.select().from(dealMeetingsTable).where(eq(dealMeetingsTable.dealId, dealId)).orderBy(desc(dealMeetingsTable.createdAt)),
      db.select().from(dealCasesTable).where(eq(dealCasesTable.dealId, dealId)).orderBy(desc(dealCasesTable.createdAt)),
      db.select().from(commissionsTable).where(eq(commissionsTable.dealId, dealId)).orderBy(desc(commissionsTable.updatedAt)),
      db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "deal"), eq(auditLogsTable.entityId, dealId))).orderBy(desc(auditLogsTable.createdAt)).limit(250),
    ]);
    res.json({ deal, participants, messages, documents, financials, inspections, shipments, customs: customs[0] ?? null, meetings, cases, commissions, timeline });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_deal_id" }); return; }
    res.status(500).json({ error: "deal_room_load_failed" });
  }
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
    let paymentEvidence: Record<string,string> | undefined;
    const agreedTerms=await recordedDealTerms(dealId);
    const alternative=Boolean(agreedTerms && agreedTerms.paymentTerms!==udcPaymentTerms);
    if (paymentMilestoneStages.has(input.status) && existingDeal.status !== input.status) {
      if(alternative){
        const [evidence]=input.paymentEvidenceDocumentId ? await db.select({id:documentsTable.id}).from(documentsTable).where(and(eq(documentsTable.id,input.paymentEvidenceDocumentId),eq(documentsTable.dealId,dealId),eq(documentsTable.status,'approved'))).limit(1) : [];
        if(!input.confirmAlternativePaymentReview||!evidence){res.status(409).json({error:'alternate_payment_review_and_approved_evidence_required'});return;}
        paymentEvidence={approvedPaymentEvidenceDocumentId:evidence.id,paymentTerms:agreedTerms!.paymentTerms};
      }else{
      const [[dlc], [inspection], [sgsDocument]] = await Promise.all([
        db.select({ id: dealFinancialsTable.id }).from(dealFinancialsTable)
          .where(and(eq(dealFinancialsTable.dealId, dealId), eq(dealFinancialsTable.instrumentType, "DLC"), eq(dealFinancialsTable.status, "confirmed"))).limit(1),
        db.select({ id: inspectionsTable.id }).from(inspectionsTable)
          .where(and(eq(inspectionsTable.dealId, dealId), eq(inspectionsTable.status, "passed"))).limit(1),
        db.select({ id: documentsTable.id }).from(documentsTable)
          .where(and(eq(documentsTable.dealId, dealId), eq(documentsTable.documentType, "SGS"), eq(documentsTable.status, "approved"))).limit(1),
      ]);
      const missing = missingPaymentEvidence({
        confirmedDestinationSgs: input.confirmDestinationSgs === true,
        confirmedDlcId: dlc?.id, passedInspectionId: inspection?.id, approvedSgsDocumentId: sgsDocument?.id,
      });
      if (missing.length) { res.status(409).json({ error: "payment_evidence_required", missing }); return; }
      paymentEvidence = { confirmedDlcId: dlc.id, passedInspectionId: inspection.id, approvedSgsDocumentId: sgsDocument.id };
      }
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
      metadata: { previousStatus: existingDeal.status, newStatus: deal.status, ...(paymentEvidence ? { ...(alternative?{alternativePaymentReviewedByAdmin:true}:{destinationSgsConfirmedByAdmin:true}), paymentEvidence } : {}) },
    });
    if (existingDeal.status !== deal.status) {
      await notifyDealCounterparties(
        deal.id,
        "deal_status_updated",
        "Deal status updated",
        `We’re at ${deal.status} now.`,
        `/deals/${deal.id}`,
      );
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
      `This deal is ${input.status} right now. I’ll keep you posted on the next step.`,
      `/deals/${deal.id}`,
    );
    res.json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "deal_issue_record_failed" });
  }
});

const meetingUrlSchema = z.string().url().max(1000).refine(value => /^https?:\/\//i.test(value), { message: "Use an HTTP or HTTPS meeting link." });
function meetingDetailsValid(input: { provider?: string | null; meetingUrl?: string | null; agenda?: string | null }) {
  return input.provider === "in_person" ? Boolean(input.agenda?.trim()) : Boolean(input.provider && input.meetingUrl);
}
const meetingInput = z.object({ scheduledAt: z.coerce.date(), provider: z.string().trim().min(2).max(50), meetingUrl: meetingUrlSchema.optional(), agenda: z.string().trim().max(1000).optional() }).refine(meetingDetailsValid, { message: "Video meetings require a joining URL; in-person meetings require a location in the agenda." });
router.post("/admin/deals/:dealId/meetings", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = meetingInput.parse(req.body); const dealId = z.string().uuid().parse(req.params["dealId"]);
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    if (!await hasVerifiedCounterparties(deal.buyerUserId, deal.sellerUserId)) {
      res.status(409).json({ error: "meeting_requires_verified_counterparties" }); return;
    }
    const [meeting] = await db.insert(dealMeetingsTable).values({ dealId, requestedBy: req.authUser.id, scheduledBy: req.authUser.id, status: "scheduled", ...input }).returning();
    await db.insert(auditLogsTable).values({ actorUserId: req.authUser.id, action: "deal_meeting_scheduled", entityType: "deal", entityId: dealId, metadata: { meetingId: meeting.id, scheduledAt: meeting.scheduledAt, provider: meeting.provider } });
    await notifyDealCounterparties(dealId, "deal_meeting_scheduled", "Deal meeting scheduled", "A UDC deal meeting has been scheduled. Open the deal for the confirmed time and joining details.", `/deals/${dealId}`);
    res.status(201).json({ meeting });
  } catch (error) { if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; } res.status(500).json({ error: "meeting_schedule_failed" }); }
});
router.get("/admin/deals/:dealId/meetings", requireRole("admin"), async (req, res) => {
  const dealId = String(req.params["dealId"] ?? ""); const meetings = await db.select().from(dealMeetingsTable).where(eq(dealMeetingsTable.dealId, dealId)).orderBy(desc(dealMeetingsTable.createdAt)); res.json({ meetings });
});

router.patch("/admin/meetings/:meetingId", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = z.string().uuid().parse(req.params["meetingId"]);
    const input = z.object({ status: z.enum(["requested","scheduled","completed","cancelled"]).optional(), scheduledAt: z.coerce.date().optional(), provider: z.string().trim().max(80).optional(), meetingUrl: meetingUrlSchema.optional(), agenda: z.string().trim().max(2000).optional(), adminNotes: z.string().trim().max(3000).optional() }).refine((v) => Object.keys(v).length > 0).parse(req.body);
    const [existing] = await db.select().from(dealMeetingsTable).where(eq(dealMeetingsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "meeting_not_found" }); return; }
    if (input.status === "scheduled" || input.scheduledAt || input.provider || input.meetingUrl) {
      if (!meetingDetailsValid({ ...existing, ...input })) { res.status(400).json({ error: "meeting_details_required" }); return; }
      const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, existing.dealId)).limit(1);
      if (!deal || !await hasVerifiedCounterparties(deal.buyerUserId, deal.sellerUserId)) {
        res.status(409).json({ error: "meeting_requires_verified_counterparties" }); return;
      }
    }
    const [meeting] = await db.update(dealMeetingsTable).set({ ...input, completedAt: input.status === "completed" ? new Date() : existing.completedAt, updatedAt: new Date() }).where(eq(dealMeetingsTable.id, id)).returning();
    await db.insert(auditLogsTable).values({ actorUserId: req.authUser.id, action: "deal_meeting_updated", entityType: "deal", entityId: meeting.dealId, metadata: { meetingId: id, previousStatus: existing.status, newStatus: meeting.status } });
    res.json({ meeting });
  } catch (error) { if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; } res.status(500).json({ error: "meeting_update_failed" }); }
});

const caseInput = z.object({ caseType: z.enum(["trade_issue","document","inspection","shipment","payment","compliance"]).default("trade_issue"), priority: z.enum(["low","normal","high","critical"]).default("normal"), summary: z.string().trim().min(5).max(2000) });
router.post("/admin/deals/:dealId/cases", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = caseInput.parse(req.body); const dealId = z.string().uuid().parse(req.params["dealId"]);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1); if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const [dealCase] = await db.insert(dealCasesTable).values({ dealId, openedBy: req.authUser.id, ...input }).returning();
    await db.insert(auditLogsTable).values({ actorUserId: req.authUser.id, action: "deal_case_opened", entityType: "deal", entityId: dealId, metadata: { caseId: dealCase.id, caseType: dealCase.caseType, priority: dealCase.priority } });
    await notifyDealCounterparties(dealId, "deal_case_opened", "UDC case opened", "UDC has opened a case on this deal and will track it through resolution.", `/deals/${dealId}`);
    res.status(201).json({ case: dealCase });
  } catch (error) { if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; } res.status(500).json({ error: "case_create_failed" }); }
});
router.patch("/admin/cases/:caseId", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = z.object({ status: z.enum(["open","investigating","waiting_party","resolved","closed"]), resolution: z.string().trim().max(3000).optional() }).parse(req.body);
    if (["resolved","closed"].includes(input.status) && !input.resolution) { res.status(400).json({ error: "resolution_required" }); return; }
    const caseId=z.string().uuid().parse(req.params["caseId"]); const [existing]=await db.select().from(dealCasesTable).where(eq(dealCasesTable.id,caseId)).limit(1); if(!existing){res.status(404).json({error:"case_not_found"});return;}
    const [dealCase]=await db.update(dealCasesTable).set({status:input.status,resolution:input.resolution??existing.resolution,resolvedAt:["resolved","closed"].includes(input.status)?new Date():null,updatedAt:new Date()}).where(eq(dealCasesTable.id,caseId)).returning();
    await db.insert(auditLogsTable).values({actorUserId:req.authUser.id,action:"deal_case_updated",entityType:"deal",entityId:dealCase.dealId,metadata:{caseId,previousStatus:existing.status,newStatus:dealCase.status}});
    res.json({case:dealCase});
  } catch(error){if(error instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}res.status(500).json({error:"case_update_failed"});}
});
router.post("/admin/cases/:caseId/evidence", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = z.string().uuid().parse(req.params["caseId"]);
    const input = z.object({ documentId: z.string().uuid().optional(), note: z.string().trim().min(2).max(2000).optional() }).refine((v) => Boolean(v.documentId || v.note)).parse(req.body);
    const [existing] = await db.select().from(dealCasesTable).where(eq(dealCasesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "case_not_found" }); return; }
    if (input.documentId) {
      const [doc] = await db.select({ id: documentsTable.id }).from(documentsTable).where(and(eq(documentsTable.id, input.documentId), eq(documentsTable.dealId, existing.dealId))).limit(1);
      if (!doc) { res.status(400).json({ error: "evidence_document_not_in_deal" }); return; }
    }
    const previous = Array.isArray(existing.evidence) ? existing.evidence : existing.evidence ? [existing.evidence] : [];
    const evidence = [...previous, { ...input, addedAt: new Date().toISOString(), addedBy: req.authUser.id }];
    const [dealCase] = await db.update(dealCasesTable).set({ evidence, updatedAt: new Date() }).where(eq(dealCasesTable.id, id)).returning();
    await db.insert(auditLogsTable).values({ actorUserId: req.authUser.id, action: "deal_case_evidence_added", entityType: "deal", entityId: existing.dealId, metadata: { caseId: id, documentId: input.documentId ?? null } });
    res.status(201).json({ case: dealCase });
  } catch (error) { if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; } res.status(500).json({ error: "case_evidence_failed" }); }
});

router.get("/admin/deals/:dealId/cases", requireRole("admin"), async(req,res)=>{const dealId=String(req.params["dealId"]??"");res.json({cases:await db.select().from(dealCasesTable).where(eq(dealCasesTable.dealId,dealId)).orderBy(desc(dealCasesTable.createdAt))});});

const customsInput=z.object({status:z.enum(["not_started","documents_pending","submitted","inspection","duties_pending","cleared","held"]),country:z.string().trim().max(100).optional(),port:z.string().trim().max(150).optional(),brokerName:z.string().trim().max(200).optional(),reference:z.string().trim().max(200).optional(),notes:z.string().trim().max(2000).optional()});
router.put("/admin/deals/:dealId/customs",requireRole("admin"),async(req:AuthenticatedRequest,res)=>{try{const input=customsInput.parse(req.body);const dealId=z.string().uuid().parse(req.params["dealId"]);const [deal]=await db.select({id:dealsTable.id}).from(dealsTable).where(eq(dealsTable.id,dealId)).limit(1);if(!deal){res.status(404).json({error:"deal_not_found"});return;}const [row]=await db.insert(customsClearanceTable).values({dealId,...input,clearedAt:input.status==="cleared"?new Date():null}).onConflictDoUpdate({target:customsClearanceTable.dealId,set:{...input,clearedAt:input.status==="cleared"?new Date():null,updatedAt:new Date()}}).returning();await db.insert(auditLogsTable).values({actorUserId:req.authUser.id,action:"customs_status_updated",entityType:"deal",entityId:dealId,metadata:{customsId:row.id,status:row.status}});await notifyDealCounterparties(dealId,"customs_status_updated","Customs status updated",`Customs clearance is now ${row.status.replaceAll("_"," ")}.`,`/deals/${dealId}`);res.json({customs:row});}catch(error){if(error instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}res.status(500).json({error:"customs_update_failed"});}});
router.get("/admin/deals/:dealId/customs",requireRole("admin"),async(req,res)=>{const dealId=String(req.params["dealId"]??"");const [customs]=await db.select().from(customsClearanceTable).where(eq(customsClearanceTable.dealId,dealId)).limit(1);res.json({customs:customs??null});});

router.get("/admin/feedback",requireRole("admin"),async(_req,res)=>{res.json({feedback:await db.select().from(dealFeedbackTable).orderBy(desc(dealFeedbackTable.createdAt))});});
router.patch("/admin/feedback/:feedbackId/status",requireRole("admin"),async(req:AuthenticatedRequest,res)=>{try{const input=z.object({status:z.enum(["approved","rejected"])}).parse(req.body);const id=z.string().uuid().parse(req.params["feedbackId"]);const [existing]=await db.select().from(dealFeedbackTable).where(eq(dealFeedbackTable.id,id)).limit(1);if(!existing){res.status(404).json({error:"feedback_not_found"});return;}const [feedback]=await db.update(dealFeedbackTable).set({status:input.status,updatedAt:new Date()}).where(eq(dealFeedbackTable.id,id)).returning();await db.insert(auditLogsTable).values({actorUserId:req.authUser.id,action:"deal_feedback_reviewed",entityType:"deal",entityId:feedback.dealId,metadata:{feedbackId:id,previousStatus:existing.status,newStatus:feedback.status}});res.json({feedback});}catch(error){if(error instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}res.status(500).json({error:"feedback_review_failed"});}});

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

const defaultCommissionPreviewSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rbiReferenceRateInrPerUnit: z.string().regex(/^\d+(?:\.\d{1,8})?$/).optional(),
  rbiReferenceRateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Actual invoice value (deal currency) from the real invoice. Without it the preview is only an estimate.
  actualInvoiceValue: z.string().regex(/^\d+(?:\.\d{1,6})?$/).optional(),
});

// Read-only preview of the published default seller rule (1% at INR 25 lakh+, 2% below, seller pays).
// Never writes, never fetches an exchange rate: an admin supplies the RBI reference rate for the invoice date.
// Foreign invoices without a matching rate return manual_review. A written per-deal fee schedule overrides this.
router.post("/admin/deals/:dealId/default-commission-preview", requireRole("admin"), async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    const input = defaultCommissionPreviewSchema.parse(req.body);
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const preview = buildDefaultCommissionPreview(deal, input);
    if ("error" in preview) { res.status(409).json({ error: preview.error }); return; }
    res.json({ dealId, ...preview });
  } catch (error) {
    if (error instanceof CommissionCalculationError) { res.status(409).json({ error: error.message }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ error: "validation_error" }); return; }
    res.status(500).json({ error: "default_commission_preview_failed" });
  }
});

router.post("/admin/commissions", requireRole("admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const input = createCommissionSchema.parse(req.body);
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'commission:' + input.dealId + ':' + input.beneficiaryUserId}))`);
      const [deal] = await tx.select().from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
      const [beneficiary] = await tx.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, input.beneficiaryUserId)).limit(1);
      if (!deal || !beneficiary) {
        res.status(404).json({ error: "commission_record_not_found" });
        return;
      }
      const method = input.commissionType ?? "fixed_amount";
      if (!TWO_DECIMAL_CURRENCIES.has((input.currency ?? deal.currency).toUpperCase())) {
        res.status(409).json({ error: "currency_precision_unconfirmed" }); return;
      }
      if (method !== "fixed_amount" && input.confirmAgreedTerms !== true) {
        res.status(400).json({ error: "commission_agreement_confirmation_required" }); return;
      }
      if (method !== "fixed_amount" && input.currency && input.currency.toUpperCase() !== deal.currency.toUpperCase()) {
        res.status(409).json({ error: "calculated_commission_uses_deal_currency" }); return;
      }
      const amount = calculateCommissionAmount({ method, quantity: deal.quantity, unit: deal.unit, agreedPrice: deal.agreedPrice, rate: input.commissionRate, amount: input.amount });
      if (method !== "fixed_amount" && input.amount !== undefined && calculateCommissionAmount({ method: "fixed_amount", quantity: deal.quantity, unit: deal.unit, agreedPrice: deal.agreedPrice, amount: input.amount }) !== amount) {
        res.status(409).json({ error: "commission_amount_does_not_match_rule" }); return;
      }
      if (beneficiary.role === "agent") {
        const [assignment] = await tx.select({ id: dealParticipantsTable.id }).from(dealParticipantsTable)
          .where(and(
            eq(dealParticipantsTable.dealId, deal.id),
            eq(dealParticipantsTable.userId, beneficiary.id),
            eq(dealParticipantsTable.participantRole, "agent"),
            eq(dealParticipantsTable.status, "active"),
          )).limit(1);
        if (!assignment) {
          res.status(409).json({ error: "agent_must_be_assigned_to_deal" });
          return;
        }
        const [existingReward] = await tx.select({ id: commissionsTable.id }).from(commissionsTable)
          .where(and(eq(commissionsTable.dealId, deal.id), eq(commissionsTable.beneficiaryUserId, beneficiary.id)))
          .limit(1);
        if (existingReward) {
          res.status(409).json({ error: "agent_commission_already_recorded" });
          return;
        }
      }

      const [commission] = await tx.insert(commissionsTable).values({
        dealId: deal.id,
        beneficiaryUserId: beneficiary.id,
        amount,
        currency: (input.currency ?? deal.currency).toUpperCase(),
        status: "pending",
        commissionType: method,
        commissionRate: method === "fixed_amount" ? undefined : String(input.commissionRate),
        commissionAmount: amount,
      }).returning();
      await tx.insert(auditLogsTable).values({
        actorUserId: req.authUser.id, action: "commission_created",
        entityType: "commission", entityId: commission.id,
        metadata: { dealId: deal.id, beneficiaryUserId: beneficiary.id, amount: commission.amount, currency: commission.currency, method, rate: commission.commissionRate, agreedTermsConfirmed: method !== "fixed_amount", quantity: deal.quantity, unit: deal.unit, agreedPrice: deal.agreedPrice },
      });
      await tx.insert(notificationsTable).values({
        userId: commission.beneficiaryUserId,
        type: "commission_created",
        title: "Commission recorded",
        body: `A ${commission.currency} ${commission.amount} commission was recorded for your deal.`,
        link: "/commissions",
      });
      return commission;
    });
    if (result) res.status(201).json({ commission: result });
  } catch (error) {
    if (error instanceof CommissionCalculationError) { res.status(400).json({ error: error.message }); return; }
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
    if (input.status === "paid" && existing.status !== "paid") {
      const [deal] = await db.select({ status: dealsTable.status }).from(dealsTable)
        .where(eq(dealsTable.id, existing.dealId)).limit(1);
      if (deal?.status !== "completed") {
        res.status(409).json({ error: "commission_requires_completed_deal" });
        return;
      }
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
  try {
    res.json({ documents: await Promise.all(documents.map(async (item) => {
      const path = managedDealDocumentPath(item.fileUrl,item.dealId);
      return { ...item, fileUrl: path ? await createSignedDownloadUrl(path) : null };
    })) });
  } catch { res.status(503).json({ error: "document_storage_unavailable" }); }
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
    if (input.status === "approved") {
      const [deal] = await db.select({ buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId })
        .from(dealsTable).where(eq(dealsTable.id, document.dealId)).limit(1);
      if (deal) await db.insert(documentAccessTable).values([
        { documentId: document.id, userId: deal.buyerUserId, accessRole: "viewer" },
        { documentId: document.id, userId: deal.sellerUserId, accessRole: "viewer" },
      ]).onConflictDoNothing();
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "document_reviewed",
      entityType: "document",
      entityId: document.id,
      metadata: { previousStatus: existing.status, newStatus: document.status, reviewNote: input.reviewNote ?? null },
    });
    if (document.status === "rejected" && existing.status !== "rejected") {
      await db.insert(notificationsTable).values({
        userId: document.uploadedBy,
        type: "document_reviewed",
        title: "Document needs correction",
        body: `Your ${document.documentType} was rejected. Reason: ${input.reviewNote}`,
        link: "/documents",
      });
    }
    if (document.status === "approved" && existing.status !== document.status) {
      await notifyDealCounterparties(
        document.dealId,
        "document_reviewed",
        "Document review completed",
        `The document is ${document.status}.`,
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
  const users = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
  }).from(usersTable)
    .where(and(
      inArray(usersTable.role, ["buyer", "seller", "agent"]),
      inArray(usersTable.status, ["active", "pending", "under_review"]),
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
      phone: usersTable.phone,
    })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!existingUser) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    if (!["buyer", "seller", "agent"].includes(existingUser.role)) {
      res.status(409).json({ error: "user_is_not_trade_counterparty" });
      return;
    }
    const { user, changed } = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'user_verification:' + userId}))`);
      const [current] = await tx.select({ status: usersTable.status }).from(usersTable)
        .where(eq(usersTable.id, userId)).limit(1);
      if (!current) throw new Error("user_not_found");
      if(input.status==='verified'&&['buyer','seller'].includes(existingUser.role)&&!await approvedCompanyEvidence(userId,tx))throw new AgreementError('verified_company_and_approved_document_required');
      const [updated] = await tx.update(usersTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id, role: usersTable.role, status: usersTable.status, updatedAt: usersTable.updatedAt });
      await tx.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "user_verification_status_updated",
        entityType: "user",
        entityId: updated.id,
        metadata: { previousStatus: current.status, newStatus: updated.status },
      });
      if (current.status !== updated.status) await tx.insert(notificationsTable).values({
        userId: updated.id, type: "verification_status_updated", title: "Verification status updated",
        body: `Your UDC verification status is now ${updated.status}.`, link: "/profile",
      });
      return { user: updated, changed: current.status !== updated.status };
    },{isolationLevel:"serializable"});
    if (changed) {
      if (existingUser.phone) {
        try {
          const delivery = await sendWhatsAppText(
            existingUser.phone,
            `UDC verification update: your account is now ${user.status}.`,
          );
          if (delivery.delivered) {
            await db.insert(notificationsTable).values({
              userId: user.id,
              type: "verification_whatsapp_sent",
              title: "WhatsApp verification update sent",
              body: `WhatsApp verification update sent for status ${user.status}.`,
              link: "/profile",
            });
          }
        } catch (error) {
          req.log.error(
            {
              userId: user.id,
              status: user.status,
              reason: error instanceof Error ? error.message : "whatsapp_delivery_failed",
            },
            "UDC could not send verification WhatsApp notification",
          );
        }
      }
    }
    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    if(error instanceof AgreementError){res.status(409).json({error:error.message});return;}
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

router.get("/admin/deals/:dealId/conversation", requireRole("admin"), async (req, res) => {
  const dealId = req.params["dealId"];
  if (typeof dealId !== "string") {
    res.status(400).json({ error: "invalid_deal_id" });
    return;
  }

  const events = await db
    .select()
    .from(dealConversationEventsTable)
    .where(eq(dealConversationEventsTable.dealId, dealId))
    .orderBy(desc(dealConversationEventsTable.createdAt));

  res.json({ events });
});

router.get("/admin/meeting-requests", requireRole("admin"), async (_req, res) => {
  try {
    const requests = await db.select({
      id: dealConversationEventsTable.id,
      dealId: dealConversationEventsTable.dealId,
      dealNumber: dealsTable.dealNumber,
      participantRole: dealConversationEventsTable.participantRole,
      originalText: dealConversationEventsTable.originalText,
      createdAt: dealConversationEventsTable.createdAt,
    }).from(dealConversationEventsTable)
      .innerJoin(dealsTable, eq(dealConversationEventsTable.dealId, dealsTable.id))
      .where(eq(dealConversationEventsTable.intent, "meeting_request"))
      .orderBy(desc(dealConversationEventsTable.createdAt))
      .limit(100);
    res.json({ requests });
  } catch {
    res.status(500).json({ error: "meeting_requests_fetch_failed" });
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
  const attempted = await db.select().from(matchesTable).where(eq(matchesTable.buyerRequestId,buyerRequest.id));
  const recommendations = [];

  for (const offer of offers) {
    if(attempted.some(m=>m.sellerListingId===offer.id))continue;
    if (!await hasVerifiedCounterparties(buyerRequest.buyerUserId, offer.sellerUserId)) continue;
    const { score, reasons } = scoreTradeMatch(buyerRequest, offer);
    recommendations.push({ sellerOffer: offer, score, reasons });
  }

  // Show the strongest compatible offers first while keeping admin approval
  // as the only way to turn a recommendation into a match.
  recommendations.sort((a, b) => b.score - a.score);

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
    const inspection = await db.transaction(async tx => {
      const [inspection] = await tx.insert(inspectionsTable).values({
      dealId: deal.id,
      requestedBy: req.authUser.id,
      inspectorName: input.inspectorName,
      scheduledAt: input.scheduledAt,
      resultSummary: input.resultSummary,
      status: input.scheduledAt ? "scheduled" : "requested",
    }).returning();
      await tx.insert(auditLogsTable).values({ actorUserId: req.authUser.id, action: "inspection_created", entityType: "deal", entityId: deal.id, metadata: { inspectionId: inspection.id, status: inspection.status } });
      return inspection;
    });
    await notifyDealCounterparties(deal.id, "inspection_created", "Inspection recorded", "An inspection has been recorded for your deal. Open the deal for its confirmed details.", `/deals/${deal.id}`);
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
        `Inspection is ${inspection.status}.`,
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
    const shipment = await db.transaction(async tx => {
      const [shipment] = await tx.insert(shipmentsTable).values({
      dealId: deal.id, carrier: input.carrier, trackingNumber: input.trackingNumber,
      origin: input.origin, destination: input.destination, estimatedArrival: input.estimatedArrival,
      notes: input.notes, status: "planned",
    }).returning();
      await tx.insert(auditLogsTable).values({ actorUserId: req.authUser!.id, action: "shipment_created", entityType: "deal", entityId: deal.id, metadata: { shipmentId: shipment.id, status: shipment.status } });
      await tx.insert(shipmentTrackingEventsTable).values({
        shipmentId:shipment.id,dealId:deal.id,kind:"planned",shipmentStatus:"planned",idempotencyKey:randomUUID(),
        source:"udc_manual",occurredAt:new Date(),recordedByUserId:req.authUser!.id,
      });
      return shipment;
    });
    await notifyDealCounterparties(deal.id, "shipment_created", "Shipment recorded", "A shipment has been recorded for your deal. Open the deal for the carrier and tracking reference.", `/deals/${deal.id}`);
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
    const {shipment,statusChanged}=await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"shipment_status:"+shipmentId}))`);
      const [before]=await tx.select({status:shipmentsTable.status})
        .from(shipmentsTable).where(eq(shipmentsTable.id,shipmentId)).limit(1);
      if(!before)throw new Error("shipment_disappeared");
      const [updated]=await tx.update(shipmentsTable)
        .set({ status: input.status, ...(input.notes === undefined ? {} : { notes: input.notes }), ...(input.estimatedArrival === undefined ? {} : { estimatedArrival: input.estimatedArrival }), updatedAt: new Date() })
        .where(eq(shipmentsTable.id, shipmentId))
        .returning();
      await tx.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "shipment_status_updated",
        entityType: "deal",
        entityId: updated.dealId,
        metadata: { shipmentId: updated.id, previousStatus: before.status, newStatus: updated.status },
      });
      const statusChanged=before.status!==updated.status;
      if(statusChanged)await tx.insert(shipmentTrackingEventsTable).values({
        shipmentId:updated.id,dealId:updated.dealId,kind:"status_update",
        shipmentStatus:updated.status,idempotencyKey:randomUUID(),
        source:"udc_manual",occurredAt:new Date(),recordedByUserId:req.authUser!.id,
      });
      return {shipment:updated,statusChanged};
    });
    if (statusChanged) {
      await notifyDealCounterparties(
        shipment.dealId,
        "shipment_status_updated",
        "Shipment status updated",
        `Shipment is ${shipment.status}.`,
        `/deals/${shipment.dealId}/tracking`,
      );
    }
    if(statusChanged)await notifyAssignedDealAgents(shipment.dealId,"shipment_milestone");
    res.json({ shipment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "shipment_update_failed" });
  }
});


// Agents receive only milestone existence and a deal-navigation prompt. Never
// include carrier IDs, shipment locations, financial terms or counterparty details.
async function notifyAssignedDealAgents(dealId:string,kind:"shipment_milestone"|"shipment_delay"){
  const agents=await db.select({userId:usersTable.id,phone:usersTable.phone})
    .from(dealParticipantsTable).innerJoin(usersTable,eq(dealParticipantsTable.userId,usersTable.id))
    .where(and(eq(dealParticipantsTable.dealId,dealId),
      eq(dealParticipantsTable.participantRole,"agent"),eq(dealParticipantsTable.status,"active"),
      eq(usersTable.role,"agent"),eq(usersTable.status,"verified")));
  if(!agents.length)return;
  const body=kind==="shipment_delay"
    ?"A shipment delay or exception was recorded for an assigned UDC deal. Open My deals → Track shipment."
    :"A shipment milestone was recorded for an assigned UDC deal. Open My deals → Track shipment.";
  await db.transaction(async tx=>{
    const notices=await tx.insert(notificationsTable).values(agents.map(a=>({
      userId:a.userId,type:kind,title:"Assigned deal shipment update",body,
      link:`/deals/${dealId}/tracking`,
    }))).returning({id:notificationsTable.id,userId:notificationsTable.userId});
    for(const notice of notices)
      await enqueueShipmentWhatsApp(tx,{
        notificationId:notice.id,dealId,recipientUserId:notice.userId,
      });
  });
}

router.post("/admin/shipments/:shipmentId/events",requireRole("admin"),async(req:AuthenticatedRequest,res)=>{
  try{
    const shipmentId=z.string().uuid().parse(req.params["shipmentId"]);
    const input=shipmentMilestoneSchema.parse(req.body);
    const [shipment]=await db.select({id:shipmentsTable.id,dealId:shipmentsTable.dealId})
      .from(shipmentsTable).where(eq(shipmentsTable.id,shipmentId)).limit(1);
    if(!shipment){res.status(404).json({error:"shipment_not_found"});return;}
    const result=await db.transaction(async tx=>{
      // Serialize same-key requests across application workers.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"shipment_event:"+input.idempotencyKey}))`);
      const [previous]=await tx.select().from(shipmentTrackingEventsTable)
        .where(eq(shipmentTrackingEventsTable.idempotencyKey,input.idempotencyKey)).limit(1);
      if(previous){
        if(previous.shipmentId!==shipment.id ||
          previous.kind!==input.kind || previous.source!==input.source ||
          (previous.location??null)!==(input.location??null) ||
          (previous.note??null)!==(input.note??null) ||
          (previous.sourceReference??null)!==(input.sourceReference??null) ||
          new Date(previous.occurredAt).getTime()!==input.occurredAt.getTime())
          return {event:previous,created:false,conflict:true};
        return {event:previous,created:false,conflict:false};
      }
      const [inserted]=await tx.insert(shipmentTrackingEventsTable).values({
        shipmentId:shipment.id,dealId:shipment.dealId,kind:input.kind,
        idempotencyKey:input.idempotencyKey,location:input.location,note:input.note,
        source:input.source,sourceReference:input.sourceReference,
        occurredAt:input.occurredAt,recordedByUserId:req.authUser!.id,
      }).returning();
      await tx.insert(auditLogsTable).values({
        actorUserId:req.authUser!.id,action:"shipment_milestone_recorded",
        entityType:"deal",entityId:shipment.dealId,
        metadata:{shipmentId:shipment.id,eventId:inserted.id,kind:inserted.kind,source:inserted.source},
      });
      return {event:inserted,created:true,conflict:false};
    });
    if(result.conflict){res.status(409).json({error:"idempotency_key_conflict"});return;}
    if(result.created){
      const urgent=input.kind==="delay"||input.kind==="exception";
      // Never include personal/counterparty details or unverified carrier claims in alerts.
      await notifyDealCounterparties(shipment.dealId,
        urgent?"shipment_delay":"shipment_milestone",
        urgent?"Shipment delay or exception recorded":"Shipment milestone recorded",
        urgent?"UDC recorded a shipment delay or exception. Open Track shipment for the recorded details.":
          "UDC recorded a shipment update. Open Track shipment in your deal to see its progress.",
        `/deals/${shipment.dealId}/tracking`);
    }
    if(result.created)await notifyAssignedDealAgents(shipment.dealId,
      input.kind==="delay"||input.kind==="exception"?"shipment_delay":"shipment_milestone");
    res.status(result.created?201:200).json({event:result.event});
  }catch(error){
    if(error instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}
    res.status(500).json({error:"shipment_milestone_create_failed"});
  }
});

// Cargo units are multiple discrete loads/containers within a shipment.
// Operators record references; this is not a live carrier data integration.
router.get("/admin/shipments/:shipmentId/cargo-units",requireRole("admin"),async(req,res)=>{
  try{
    const shipmentId=z.string().uuid().parse(req.params["shipmentId"]);
    const [shipment]=await db.select({id:shipmentsTable.id}).from(shipmentsTable)
      .where(eq(shipmentsTable.id,shipmentId)).limit(1);
    if(!shipment){res.status(404).json({error:"shipment_not_found"});return;}
    const units=await db.select().from(shipmentCargoUnitsTable)
      .where(eq(shipmentCargoUnitsTable.shipmentId,shipmentId))
      .orderBy(shipmentCargoUnitsTable.createdAt);
    res.json({units});
  }catch(error){
    res.status(error instanceof z.ZodError?400:500).json({error:error instanceof z.ZodError?"validation_error":"cargo_units_fetch_failed"});
  }
});

router.post("/admin/shipments/:shipmentId/cargo-units",requireRole("admin"),async(req:AuthenticatedRequest,res)=>{
  try{
    const shipmentId=z.string().uuid().parse(req.params["shipmentId"]);
    const input=cargoUnitSchema.parse(req.body);
    const [shipment]=await db.select({id:shipmentsTable.id,dealId:shipmentsTable.dealId})
      .from(shipmentsTable).where(eq(shipmentsTable.id,shipmentId)).limit(1);
    if(!shipment){res.status(404).json({error:"shipment_not_found"});return;}
    const existing=await db.select({id:shipmentCargoUnitsTable.id})
      .from(shipmentCargoUnitsTable)
      .where(and(eq(shipmentCargoUnitsTable.shipmentId,shipmentId),
        eq(shipmentCargoUnitsTable.unitReference,input.unitReference))).limit(1);
    if(existing.length){res.status(409).json({error:"unit_reference_conflict"});return;}
    const unit=await db.transaction(async tx=>{
      const [created]=await tx.insert(shipmentCargoUnitsTable).values({
        shipmentId,dealId:shipment.dealId,transportMode:input.transportMode,
        unitReference:input.unitReference,estimatedArrival:input.estimatedArrival,
        vesselName:input.vesselName,voyageNumber:input.voyageNumber,
        flightNumber:input.flightNumber,vehicleReference:input.vehicleReference,
        billOfLading:input.billOfLading,airWaybill:input.airWaybill,
      }).returning();
      await tx.insert(auditLogsTable).values({
        actorUserId:req.authUser!.id,action:"shipment_cargo_unit_created",
        entityType:"deal",entityId:shipment.dealId,
        metadata:{shipmentId,unitId:created.id,transportMode:created.transportMode},
      });
      return created;
    });
    res.status(201).json({unit});
  }catch(error){
    if(error instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}
    if((error as {code?:string})?.code==="23505"){res.status(409).json({error:"unit_reference_conflict"});return;}
    res.status(500).json({error:"cargo_unit_create_failed"});
  }
});

router.patch("/admin/cargo-units/:unitId",requireRole("admin"),async(req:AuthenticatedRequest,res)=>{
  try{
    const unitId=z.string().uuid().parse(req.params["unitId"]);
    const input=cargoUnitUpdateSchema.parse(req.body);
    const result=await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"cargo_unit:"+unitId}))`);
      const [previous]=await tx.select().from(shipmentCargoUnitsTable)
        .where(eq(shipmentCargoUnitsTable.id,unitId)).limit(1);
      if(!previous)return null;
      const [unit]=await tx.update(shipmentCargoUnitsTable)
        .set({status:input.status,
          ...(input.currentLocation===undefined?{}:{currentLocation:input.currentLocation}),
          ...(input.estimatedArrival===undefined?{}:{estimatedArrival:input.estimatedArrival}),
          lastUpdateSource:"udc_manual",lastReportedAt:new Date(),updatedAt:new Date(),
        }).where(eq(shipmentCargoUnitsTable.id,unitId)).returning();
      await tx.insert(auditLogsTable).values({
        actorUserId:req.authUser!.id,action:"shipment_cargo_unit_updated",
        entityType:"deal",entityId:unit.dealId,
        metadata:{shipmentId:unit.shipmentId,unitId:unit.id,previousStatus:previous.status,newStatus:unit.status},
      });
      const changed=previous.status!==unit.status;
      if(changed){
        await tx.insert(shipmentTrackingEventsTable).values({
          shipmentId:unit.shipmentId,dealId:unit.dealId,kind:"status_update",
          shipmentStatus:unit.status,idempotencyKey:randomUUID(),
          note:"Cargo unit "+unit.unitReference+" status updated",
          source:"udc_manual",occurredAt:new Date(),recordedByUserId:req.authUser!.id,
        });
      }
      return {unit,changed};
    });
    if(!result){res.status(404).json({error:"cargo_unit_not_found"});return;}
    if(result.changed){
      await notifyDealCounterparties(result.unit.dealId,"cargo_unit_status_updated",
        "Cargo progress updated","UDC recorded new cargo-unit progress. Open Track shipment for the details.",
        `/deals/${result.unit.dealId}/tracking`);
      await notifyAssignedDealAgents(result.unit.dealId,"shipment_milestone");
    }
    res.json({unit:result.unit});
  }catch(error){
    res.status(error instanceof z.ZodError?400:500).json({error:error instanceof z.ZodError?"validation_error":"cargo_unit_update_failed"});
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
      currency: (input.currency ?? deal.currency).toUpperCase(),
      terms: "Release after SGS inspection at destination",
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
      updatedAt: new Date(),
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
        `DLC is ${instrument.status}.`,
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
    const [[deal], [agent], existingAgents] = await Promise.all([
      db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1),
      db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, input.userId)).limit(1),
      db.select({
        userId: dealParticipantsTable.userId,
        referredByAgentUserId: dealParticipantsTable.referredByAgentUserId,
        referralPosition: dealParticipantsTable.referralPosition,
        commissionSharePct: dealParticipantsTable.commissionSharePct,
      }).from(dealParticipantsTable).where(and(
        eq(dealParticipantsTable.dealId, dealId),
        eq(dealParticipantsTable.participantRole, "agent"),
        eq(dealParticipantsTable.status, "active"),
      )),
    ]);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    if (agent?.role !== "agent") {
      res.status(409).json({ error: "user_is_not_agent" });
      return;
    }
    if (input.referredByAgentUserId && !existingAgents.some((member) => member.userId === input.referredByAgentUserId)) {
      res.status(409).json({ error: "referring_agent_not_on_deal" });
      return;
    }
    if (!canAllocateCommissionShare(existingAgents, input.commissionSharePct)) {
      res.status(409).json({ error: "agent_commission_pool_exceeds_100_percent" });
      return;
    }
    const [participant] = await db.insert(dealParticipantsTable).values({
      dealId: deal.id,
      userId: agent.id,
      participantRole: "agent",
      status: "active",
      referredByAgentUserId: input.referredByAgentUserId,
      referralPosition: nextReferralPosition(existingAgents),
      commissionSharePct: input.commissionSharePct === undefined ? undefined : String(input.commissionSharePct),
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
      metadata: { agentUserId: agent.id, referredByAgentUserId: input.referredByAgentUserId ?? null, referralPosition: participant.referralPosition, commissionSharePct: participant.commissionSharePct },
    });
    await db.insert(notificationsTable).values({
      userId: agent.id,
      type: "deal_agent_assigned",
      title: "You were assigned to a deal",
      body: "UDC added you to a deal referral chain. You can follow the deal progress without seeing private counterparty details.",
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


router.get("/admin/deals/:dealId/intelligence", requireRole("admin"), async (req, res) => {
  try {
    const dealId = req.params["dealId"];
    if (typeof dealId !== "string") {
      res.status(400).json({ error: "invalid_deal_id" });
      return;
    }

    const snapshot = await refreshDealIntelligenceSnapshot(dealId);
    res.json({ snapshot });
  } catch (error) {
    if (error instanceof Error && error.message === "deal_not_found") {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }
    res.status(500).json({ error: "deal_intelligence_fetch_failed" });
  }
});

router.post("/admin/deals/:dealId/intelligence/rebuild", requireRole("admin"), async (req, res) => {
  try {
    const dealId = req.params["dealId"];
    if (typeof dealId !== "string") {
      res.status(400).json({ error: "invalid_deal_id" });
      return;
    }

    const [deal] = await db.select({ id: dealsTable.id })
      .from(dealsTable)
      .where(eq(dealsTable.id, dealId))
      .limit(1);
    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    const documents = await db.select()
      .from(documentsTable)
      .where(eq(documentsTable.dealId, dealId))
      .orderBy(desc(documentsTable.createdAt));

    const rebuildable = documents
      .map((document) => ({ document, path: parseStoragePath(document.fileUrl) }))
      .filter((item): item is { document: typeof documents[number]; path: string } => Boolean(item.path));

    void (async () => {
      for (const item of rebuildable) {
        try {
          const downloaded = await downloadDocumentBytes(item.path);
          const fileName = item.path.split("/").pop() || "document";
          await processDocumentIntelligence({
            documentId: item.document.id,
            dealId,
            documentType: item.document.documentType,
            bytes: downloaded.bytes,
            fileName,
            mimeType: downloaded.contentType,
          });
        } catch {
          // The extraction record stores retry failure state; continue other documents.
        }
      }
      await refreshDealIntelligenceSnapshot(dealId).catch(() => undefined);
    })();

    res.status(202).json({
      queued: rebuildable.length,
      skipped: documents.length - rebuildable.length,
    });
  } catch {
    res.status(500).json({ error: "deal_intelligence_rebuild_failed" });
  }
});

export default router;
