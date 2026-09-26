import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../auth/middleware";
import { scoreOpportunity } from "../akif/intelligence/opportunityScoring";
import { akifProviderRegistry } from "../akif/intelligence/providerRegistry";

const router: IRouter = Router();

const opportunitySignalsSchema = z
  .object({
    demandStrength: z.number().min(0).max(1),
    supplyStrength: z.number().min(0).max(1),
    companyConfidence: z.number().min(0).max(1),
    dataFreshness: z.number().min(0).max(1),
    provenanceCoverage: z.number().min(0).max(1),
    priceFit: z.number().min(0).max(1).optional(),
    logisticsFit: z.number().min(0).max(1).optional(),
    complianceRisk: z.number().min(0).max(1).optional(),
  })
  .strict();

router.get(
  "/admin/akif/intelligence/capabilities",
  requireRole("admin"),
  (_req, res) => {
    res.json({
      akif: {
        mode: "assistive",
        humanApprovalRequiredForSensitiveDecisions: true,
        capabilities: [
          "provider_registry",
          "source_provenance",
          "explainable_opportunity_scoring",
        ],
        connectedResearchProviders: akifProviderRegistry.list(),
      },
    });
  },
);

router.post(
  "/admin/akif/intelligence/score",
  requireRole("admin"),
  (req, res) => {
    try {
      const signals = opportunitySignalsSchema.parse(req.body);
      res.json({
        assessment: scoreOpportunity(signals),
        notice:
          "AKIF opportunity scores are decision support, not verification, legal advice, or approval to transact.",
      });
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
      res.status(500).json({ error: "akif_intelligence_score_failed" });
    }
  },
);

export default router;
