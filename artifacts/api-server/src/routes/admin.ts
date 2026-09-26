import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { buyerRequestsTable, companiesTable, sellerListingsTable } from "@workspace/db";
import { requireRole } from "../auth/middleware";

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

export default router;