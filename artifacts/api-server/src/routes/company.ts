import { Router, type IRouter, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { companiesTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

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