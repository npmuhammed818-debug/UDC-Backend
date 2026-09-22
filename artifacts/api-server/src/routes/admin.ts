import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { companiesTable } from "@workspace/db";
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

export default router;