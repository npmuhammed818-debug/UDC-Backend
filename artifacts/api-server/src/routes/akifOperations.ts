import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import {
  auditLogsTable,
  akifResearchRunsTable,
  buyerRequestsTable,
  db,
  sellerListingsTable,
} from "@workspace/db";
import { requireRole } from "../auth/middleware";
import { getAkifDealContext } from "../akif/intelligence/dealContext";
import { assessDealRisks } from "../akif/intelligence/dealMonitoring";
import { scoreBuyerSellerMatch } from "../akif/intelligence/matchScoring";
import { getAkifAdminSummary } from "../akif/intelligence/adminSummary";
import { parseResearchIntent } from "../akif/intelligence/researchIntent";
import { runMarketResearch } from "../akif/intelligence/researchOrchestrator";
import {
  analyzeAkifMarket,
  analyzeAkifProduct,
  assessAkifVerification,
  calculateAkifLandedCost,
  compareAkifDocuments,
  explainAkifTopic,
  runAkifReasoning,
} from "../akif/intelligence/workerClient";

const router: IRouter = Router();

const productSchema = z.object({
  product: z.string().trim().min(2).max(300),
  origin_country: z.string().trim().max(120).optional(),
  destination_country: z.string().trim().max(120).optional(),
  use_llm_fallback: z.boolean().optional(),
}).strict();

const marketSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
}).strict();

const landedCostSchema = z.object({
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  freight_total: z.number().nonnegative().optional(),
  insurance_total: z.number().nonnegative().optional(),
  inspection_total: z.number().nonnegative().optional(),
  handling_total: z.number().nonnegative().optional(),
  other_total: z.number().nonnegative().optional(),
  duty_rate_percent: z.number().min(0).max(1000).optional(),
  tax_rate_percent: z.number().min(0).max(1000).optional(),
  target_sale_price_per_unit: z.number().nonnegative().optional(),
}).strict();

const verificationSchema = z.object({
  registration_confirmed: z.boolean().nullable().optional(),
  domain_matches_company: z.boolean().nullable().optional(),
  contact_matches_domain: z.boolean().nullable().optional(),
  trade_history_found: z.boolean().nullable().optional(),
  documents_consistent: z.boolean().nullable().optional(),
  address_consistent: z.boolean().nullable().optional(),
  sanctions_hit: z.boolean().nullable().optional(),
  adverse_media_found: z.boolean().nullable().optional(),
  source_count: z.number().int().min(0).max(1000).optional(),
}).strict();

const documentCompareSchema = z.object({
  documents: z.array(z.object({
    label: z.string().min(1).max(80),
    text: z.string().min(1).max(500_000),
  }).strict()).min(2).max(10),
}).strict();

const learnSchema = z.object({
  topic: z.string().trim().min(2).max(120),
}).strict();

const researchSchema = z.object({
  query: z.string().trim().min(5).max(500),
  period: z.string().trim().min(4).max(20).optional(),
}).strict();

const reasoningSchema = z.object({
  task: z.enum([
    "trade_question",
    "company_analysis",
    "document_analysis",
    "opportunity_analysis",
    "message_understanding",
  ]),
  prompt: z.string().min(1).max(20_000),
  context: z.record(z.string(), z.unknown()).default({}),
  mode: z.enum(["single", "specialist_review"]).default("single"),
}).strict();

function validationError(res: Response, error: unknown) {
  if (!(error instanceof z.ZodError)) return false;
  res.status(400).json({
    error: "validation_error",
    details: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
  return true;
}

router.post("/admin/akif/product/analyze", requireRole("admin"), async (req, res) => {
  try {
    res.json(await analyzeAkifProduct(productSchema.parse(req.body)));
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_product_analysis_failed" });
  }
});

router.post("/admin/akif/market/analyze", requireRole("admin"), async (req, res) => {
  try {
    res.json(await analyzeAkifMarket(marketSchema.parse(req.body)));
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_market_analysis_failed" });
  }
});

router.post("/admin/akif/economics/landed-cost", requireRole("admin"), async (req, res) => {
  try {
    res.json(await calculateAkifLandedCost(landedCostSchema.parse(req.body)));
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_landed_cost_failed" });
  }
});

router.post("/admin/akif/verification/assess", requireRole("admin"), async (req, res) => {
  try {
    res.json(await assessAkifVerification(verificationSchema.parse(req.body)));
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_verification_assessment_failed" });
  }
});

router.post("/admin/akif/documents/compare", requireRole("admin"), async (req, res) => {
  try {
    res.json(await compareAkifDocuments(documentCompareSchema.parse(req.body)));
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_document_comparison_failed" });
  }
});

router.post("/admin/akif/learn", requireRole("admin"), async (req, res) => {
  try {
    res.json(await explainAkifTopic(learnSchema.parse(req.body)));
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_learn_failed" });
  }
});

router.get(
  "/admin/akif/match-suggestions/:buyerRequestId",
  requireRole("admin"),
  async (req, res) => {
    try {
      const buyerRequestId = z.string().uuid().parse(req.params["buyerRequestId"]);
      const [buyer] = await db.select().from(buyerRequestsTable)
        .where(eq(buyerRequestsTable.id, buyerRequestId)).limit(1);
      if (!buyer) {
        res.status(404).json({ error: "buyer_request_not_found" });
        return;
      }

      const sellers = await db.select().from(sellerListingsTable)
        .where(and(
          eq(sellerListingsTable.status, "approved"),
          eq(sellerListingsTable.productId, buyer.productId),
        ))
        .orderBy(desc(sellerListingsTable.updatedAt));

      const suggestions = sellers
        .map((seller) => ({
          seller,
          assessment: scoreBuyerSellerMatch(buyer, seller),
        }))
        .filter(({ assessment }) => assessment.eligible)
        .sort((a, b) => b.assessment.score - a.assessment.score);

      res.json({
        buyerRequest: buyer,
        suggestions,
        notice: "AKIF match suggestions require administrator review before a UDC match is created.",
      });
    } catch (error) {
      if (validationError(res, error)) return;
      res.status(500).json({ error: "akif_match_suggestions_failed" });
    }
  },
);

router.get(
  "/admin/akif/deals/:dealId/context",
  requireRole("admin"),
  async (req, res) => {
    try {
      const dealId = z.string().uuid().parse(req.params["dealId"]);
      const context = await getAkifDealContext(dealId);
      if (!context) {
        res.status(404).json({ error: "deal_not_found" });
        return;
      }
      res.json({ context });
    } catch (error) {
      if (validationError(res, error)) return;
      res.status(500).json({ error: "akif_deal_context_failed" });
    }
  },
);

router.get(
  "/admin/akif/deals/:dealId/monitor",
  requireRole("admin"),
  async (req, res) => {
    try {
      const dealId = z.string().uuid().parse(req.params["dealId"]);
      const context = await getAkifDealContext(dealId);
      if (!context) {
        res.status(404).json({ error: "deal_not_found" });
        return;
      }
      res.json({
        deal: { id: context.deal.id, dealNumber: context.deal.dealNumber, status: context.deal.status },
        flags: assessDealRisks(context),
        notice: "AKIF alerts are decision support and do not replace inspection, banking, legal or compliance review.",
      });
    } catch (error) {
      if (validationError(res, error)) return;
      res.status(500).json({ error: "akif_deal_monitor_failed" });
    }
  },
);


router.post("/admin/akif/reasoning", requireRole("admin"), async (req, res) => {
  try {
    const input = reasoningSchema.parse(req.body);
    const result = await runAkifReasoning(input);
    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: input.mode === "specialist_review" ? "akif_specialist_review_run" : "akif_reasoning_run",
      entityType: "akif_reasoning",
      metadata: {
        task: input.task,
        mode: result.mode,
        model: result.model,
        humanReviewRequired: result.human_review_required,
        roles: result.specialist_review ? ["evidence_analyst", "risk_reviewer", "coordinator"] : ["single"],
      },
    });
    res.json(result);
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_reasoning_failed" });
  }
});

router.post("/admin/akif/research", requireRole("admin"), async (req, res) => {
  try {
    const input = researchSchema.parse(req.body);
    const intent = parseResearchIntent(input.query);
    if (!intent) {
      res.status(400).json({
        error: "unsupported_research_query",
        example: "Find buyers for W320 cashew in UAE",
      });
      return;
    }
    const result = await runMarketResearch({
      requestedBy: req.authUser!.id,
      product: intent.product,
      targetCountry: intent.targetCountry,
      direction: intent.direction,
      period: input.period,
    });
    res.json(result);
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_research_failed" });
  }
});

router.post("/admin/akif/research/:runId/execute", requireRole("admin"), async (req, res) => {
  try {
    const runId = z.string().uuid().parse(req.params["runId"]);
    const [run] = await db.select().from(akifResearchRunsTable)
      .where(eq(akifResearchRunsTable.id, runId)).limit(1);
    if (!run) {
      res.status(404).json({ error: "research_run_not_found" });
      return;
    }
    if (!run.product || !run.targetCountry || (run.direction !== "buyer" && run.direction !== "seller")) {
      res.status(409).json({ error: "research_run_missing_structured_intent" });
      return;
    }
    const result = await runMarketResearch({
      researchRunId: run.id,
      requestedBy: run.requestedBy ?? undefined,
      product: run.product,
      targetCountry: run.targetCountry,
      direction: run.direction,
    });
    res.json(result);
  } catch (error) {
    if (validationError(res, error)) return;
    res.status(502).json({ error: "akif_research_execution_failed" });
  }
});

router.get("/admin/akif/research", requireRole("admin"), async (_req, res) => {
  try {
    const runs = await db.select().from(akifResearchRunsTable)
      .orderBy(desc(akifResearchRunsTable.createdAt))
      .limit(50);
    res.json({ runs });
  } catch {
    res.status(500).json({ error: "akif_research_history_failed" });
  }
});

router.get("/admin/akif/summary", requireRole("admin"), async (_req, res) => {
  try {
    res.json(await getAkifAdminSummary());
  } catch {
    res.status(500).json({ error: "akif_summary_failed" });
  }
});

export default router;
