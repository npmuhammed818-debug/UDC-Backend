import { Router, raw, type IRouter, type Response } from "express";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogsTable, companiesTable, companyVerificationDocumentsTable, db } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { createSignedDownloadUrl, parseStoragePath, uploadDocumentBytes } from "../supabase/storage";

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
      const path = parseStoragePath(item.fileUrl);
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
      const fileUrl = await uploadDocumentBytes(`companies/${company.id}/${randomUUID()}.pdf`, bytes, "application/pdf");
      const [document] = await db.insert(companyVerificationDocumentsTable).values({
        companyId: company.id, uploadedBy: req.authUser!.id, documentType, fileUrl, status: "pending",
      }).returning({ id: companyVerificationDocumentsTable.id, documentType: companyVerificationDocumentsTable.documentType, status: companyVerificationDocumentsTable.status, createdAt: companyVerificationDocumentsTable.createdAt });
      await db.insert(auditLogsTable).values({ actorUserId: req.authUser!.id, action: "company_verification_document_uploaded", entityType: "company_verification_document", entityId: document.id, metadata: { companyId: company.id, documentType } });
      res.status(201).json({ document });
    } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_document_type" }); return; }
      res.status(500).json({ error: "company_document_upload_failed" });
    }
  });

router.post("/company", requireAuth, async (req, res) => {
  try {
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

    const [company] = await db
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
        updatedAt: new Date(),
      })
      .where(eq(companiesTable.id, existing.id))
      .returning(companySelection);

    res.json({ company });
  } catch (error) {
    if (validationResponse(res, error)) return;
    res.status(500).json({ error: "company_update_failed" });
  }
});

export default router;
