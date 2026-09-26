import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  buyerRequestsTable,
  db,
  sellerListingsTable,
} from "@workspace/db";
import { requireRole } from "../auth/middleware";
import { getAkifDealContext } from "../akif/intelligence/dealContext";
import { assessDealRisks } from "../akif/intelligence/dealMonitoring";
import { scoreBuyerSellerMatch } from "../akif/intelligence/matchScoring";
import {
  analyzeAkifMarket,
  analyzeAkifProduct,
  assessAkifVerification,
  calculateAkifLandedCost,
  compareAkifDocuments,
  explainAkifTopic,
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

function validationError(res: Parameters<Parameters<IRouter["post"]>[1]>[1], error: unknown) {
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

export default router;
