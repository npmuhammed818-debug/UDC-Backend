import { Router, raw, type IRouter, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogsTable, companiesTable, companyVerificationDocumentsTable, db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { createSignedDownloadUrl, uploadDocumentBytes, removeDocumentObject } from "../supabase/storage";
import { managedCompanyDocumentPath } from "../supabase/documentAccessPath";

const router: IRouter = Router();

const companySchema = z
  .object({
    company_name: z.string().trim().min(2).max(200),
    registration_number: z.string().trim().max(100).nullable().optional(),
    country: z.string().trim().min(2).max(100).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    website: z.string().trim().url().max(500).nullable().optional(),
  })
  .strict();

const companyUpdateSchema = companySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one company field is required." },
);

const companySelection = {
  id: companiesTable.id,
  ownerUserId: companiesTable.ownerUserId,
  companyName: companiesTable.companyName,
  registrationNumber: companiesTable.registrationNumber,
  country: companiesTable.country,
  address: companiesTable.address,
  website: companiesTable.website,
  verificationStatus: companiesTable.verificationStatus,
  createdAt: companiesTable.createdAt,
  updatedAt: companiesTable.updatedAt,
};

const companyDocumentType = z.enum(["company_registration", "business_license", "tax_certificate", "other"]);

async function getCompanyForUser(userId: string) {
  const [company] = await db
    .select(companySelection)
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId))
    .orderBy(desc(companiesTable.createdAt))
    .limit(1);
  return company;
}

function validationResponse(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return true;
  }
  return false;
}

router.get("/company", requireAuth, async (req, res) => {
  res.json({ company: (await getCompanyForUser(req.authUser!.id)) ?? null });
});

router.get("/company/documents", requireAuth, async (req, res) => {
  try {
    const company = await getCompanyForUser(req.authUser!.id);
    if (!company) { res.status(404).json({ error: "company_not_found" }); return; }
    const documents = await db.select({
      id: companyVerificationDocumentsTable.id,
      documentType: companyVerificationDocumentsTable.documentType,
      fileUrl: companyVerificationDocumentsTable.fileUrl,
      status: companyVerificationDocumentsTable.status,
      reviewNote: companyVerificationDocumentsTable.reviewNote,
      createdAt: companyVerificationDocumentsTable.createdAt,
    }).from(companyVerificationDocumentsTable)
      .where(eq(companyVerificationDocumentsTable.companyId, company.id))
      .orderBy(desc(companyVerificationDocumentsTable.createdAt));
    res.json({ documents: await Promise.all(documents.map(async (item) => {
      const path = managedCompanyDocumentPath(item.fileUrl,company.id);
      return { ...item, fileUrl: path ? await createSignedDownloadUrl(path) : null };
    })) });
  } catch { res.status(500).json({ error: "company_documents_fetch_failed" }); }
});

router.post("/company/documents/upload", requireAuth,
  raw({ type: "application/pdf", limit: "5mb" }), async (req, res) => {
    try {
      const documentType = companyDocumentType.parse(req.query["documentType"]);
      const company = await getCompanyForUser(req.authUser!.id);
      if (!company) { res.status(404).json({ error: "company_not_found" }); return; }
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > 5 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") {
        res.status(400).json({ error: "pdf_required_max_5mb" }); return;
      }
      let uploadedPath: string | undefined;
      let document;
      try {
        document=await db.transaction(async tx=>{
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'company_upload:'+req.authUser!.id}))`);
          const [{n:uploadsToday}]=(await tx.execute(sql`select count(*)::int as n from company_verification_documents where uploaded_by=${req.authUser!.id} and created_at > ${new Date(Date.now()-86400000)}`)).rows as Array<{n:number}>;
          if(uploadsToday>=10)return null;
          const path=`companies/${company.id}/${randomUUID()}.pdf`;
          const fileUrl=await uploadDocumentBytes(path,bytes,'application/pdf');uploadedPath=path;
          const [saved]=await tx.insert(companyVerificationDocumentsTable).values({companyId:company.id,uploadedBy:req.authUser!.id,documentType,fileUrl,status:'pending'}).returning({id:companyVerificationDocumentsTable.id,documentType:companyVerificationDocumentsTable.documentType,status:companyVerificationDocumentsTable.status,createdAt:companyVerificationDocumentsTable.createdAt});
          await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'company_verification_document_uploaded',entityType:'company_verification_document',entityId:saved.id,metadata:{companyId:company.id,documentType}});
          return saved;
        });
      }catch(error){if(uploadedPath)try{await removeDocumentObject(uploadedPath);}catch{console.warn('Company upload cleanup needs review',{reason:'object_cleanup_failed'});}throw error;}
      if(!document){res.status(429).json({error:'upload_quota_exceeded'});return;}
      res.status(201).json({ document });
    } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_document_type" }); return; }
      res.status(500).json({ error: "company_document_upload_failed" });
    }
  });

router.post("/company", requireAuth, async (req, res) => {
  try {
    // Companies belong to trading roles; agents introduce traders, they do not trade.
    if (req.authUser!.role === "agent") { res.status(403).json({ error: "company_not_available_for_agents" }); return; }
    const input = companySchema.parse(req.body);
    const existing = await getCompanyForUser(req.authUser!.id);
    if (existing) {
      res.status(409).json({ error: "company_already_exists" });
      return;
    }

    const [company] = await db
      .insert(companiesTable)
      .values({
        ownerUserId: req.authUser!.id,
        companyName: input.company_name,
        registrationNumber: input.registration_number,
        country: input.country,
        address: input.address,
        website: input.website,
        verificationStatus: "pending",
      })
      .returning(companySelection);

    res.status(201).json({ company });
  } catch (error) {
    if (validationResponse(res, error)) return;
    res.status(500).json({ error: "company_create_failed" });
  }
});

router.put("/company", requireAuth, async (req, res) => {
  try {
    const input = companyUpdateSchema.parse(req.body);
    const existing = await getCompanyForUser(req.authUser!.id);
    if (!existing) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }

    const nextIdentity = {
      companyName: input.company_name ?? existing.companyName,
      registrationNumber: input.registration_number === undefined ? existing.registrationNumber : input.registration_number,
      country: input.country === undefined ? existing.country : input.country,
      address: input.address === undefined ? existing.address : input.address,
      website: input.website === undefined ? existing.website : input.website,
    };
    const changedFields = (Object.keys(nextIdentity) as Array<keyof typeof nextIdentity>)
      .filter((field) => nextIdentity[field] !== existing[field]);
    const identityChanged = changedFields.length > 0;
    if (!identityChanged) {
      res.json({ company: existing });
      return;
    }
    const previousVerificationStatus = existing.verificationStatus;
    const nextVerificationStatus = identityChanged && previousVerificationStatus !== "pending"
      ? "pending"
      : previousVerificationStatus;

    const company = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(companiesTable)
        .set({
        ...(input.company_name === undefined
          ? {}
          : { companyName: input.company_name }),
        ...(input.registration_number === undefined
          ? {}
          : { registrationNumber: input.registration_number }),
        ...(input.country === undefined ? {} : { country: input.country }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.website === undefined ? {} : { website: input.website }),
        ...(nextVerificationStatus === previousVerificationStatus
          ? {}
          : { verificationStatus: nextVerificationStatus }),
        updatedAt: new Date(),
        })
        .where(eq(companiesTable.id, existing.id))
        .returning(companySelection);

      let invalidatedDocuments = 0;
      if (identityChanged) {
        const invalidated = await tx.update(companyVerificationDocumentsTable).set({
          status: "rejected",
          reviewNote: "Company details changed. Upload current supporting evidence for review.",
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: new Date(),
        }).where(and(
          eq(companyVerificationDocumentsTable.companyId, existing.id),
          inArray(companyVerificationDocumentsTable.status, ["pending", "approved"]),
        )).returning({ id: companyVerificationDocumentsTable.id });
        invalidatedDocuments = invalidated.length;
      }

      await tx.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action: "company_profile_updated",
        entityType: "company",
        entityId: existing.id,
        metadata: {
          changedFields,
          previousVerificationStatus,
          newVerificationStatus: nextVerificationStatus,
          invalidatedDocumentCount: invalidatedDocuments,
        },
      });

      if (identityChanged && (previousVerificationStatus !== "pending" || invalidatedDocuments > 0)) {
        await tx.insert(notificationsTable).values({
          userId: req.authUser!.id,
          type: "company_verification_reset",
          title: "Company evidence needs re-review",
          body: "Your company details changed. Verification has been reset and current supporting documents must be reviewed again.",
          link: "/profile",
        });
      }
      return updated;
    });

    res.json({ company });
  } catch (error) {
    if (validationResponse(res, error)) return;
    res.status(500).json({ error: "company_update_failed" });
  }
});

export default router;
