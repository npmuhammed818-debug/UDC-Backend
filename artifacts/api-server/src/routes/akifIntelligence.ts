import { Router, type IRouter } from "express";
import { auditLogsTable, db } from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../auth/middleware";
import { scoreOpportunity } from "../akif/intelligence/opportunityScoring";
import { akifProviderRegistry } from "../akif/intelligence/providerRegistry";
import {
  dedupeAkifEntities,
  getAkifWorkerCapabilities,
  isAkifWorkerConfigured,
  previewAkifComtrade,
  runAkifReasoning,
} from "../akif/intelligence/workerClient";

const router: IRouter = Router();

const entityDedupeSchema = z
  .object({
    records: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            name: z.string().trim().min(1).max(300),
            country: z.string().trim().max(120).optional(),
            website: z.string().url().optional(),
            email: z.string().email().optional(),
            phone: z.string().trim().max(80).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(500),
    threshold: z.number().min(0.5).max(1).optional(),
  })
  .strict();

const comtradePreviewSchema = z
  .object({
    period: z.string().min(4).max(100),
    reporter_code: z.string().min(1).max(50),
    cmd_code: z.string().min(1).max(200),
    flow_code: z.string().min(1).max(20),
    partner_code: z.string().max(50).optional(),
    partner2_code: z.string().max(50).optional(),
    customs_code: z.string().max(50).optional(),
    mot_code: z.string().max(50).optional(),
    frequency: z.enum(["A", "M"]).optional(),
    classification: z.string().min(1).max(20).optional(),
    max_records: z.number().int().min(1).max(500).optional(),
  })
  .strict();

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

const reasoningSchema = z
  .object({
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
          "open_source_worker_bridge",
          "specialist_review",
        ],
        connectedResearchProviders: akifProviderRegistry.list(),
        workerConfigured: isAkifWorkerConfigured(),
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

router.get(
  "/admin/akif/intelligence/worker",
  requireRole("admin"),
  async (_req, res) => {
    if (!isAkifWorkerConfigured()) {
      res.json({
        status: "not_configured",
        configured: false,
        requiredEnvironmentVariables: ["AKIF_WORKER_URL", "AKIF_WORKER_TOKEN"],
      });
      return;
    }

    try {
      const capabilities = await getAkifWorkerCapabilities();
      res.json({ status: "connected", configured: true, capabilities });
    } catch {
      res.status(502).json({
        error: "akif_worker_unavailable",
        configured: true,
      });
    }
  },
);

router.post(
  "/admin/akif/intelligence/reason",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = reasoningSchema.parse(req.body);
      const result = await runAkifReasoning(input);
      await db.insert(auditLogsTable).values({
        actorUserId: req.authUser!.id,
        action:
          input.mode === "specialist_review"
            ? "akif_specialist_review_run"
            : "akif_reasoning_run",
        entityType: "akif_reasoning",
        metadata: {
          task: input.task,
          mode: result.mode,
          model: result.model,
          humanReviewRequired: result.human_review_required,
          roles: result.specialist_review
            ? ["evidence_analyst", "risk_reviewer", "coordinator"]
            : ["single"],
        },
      });
      res.json(result);
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
      res.status(502).json({ error: "akif_reasoning_failed" });
    }
  },
);

router.post(
  "/admin/akif/intelligence/entities/dedupe",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = entityDedupeSchema.parse(req.body);
      const result = await dedupeAkifEntities(input);
      res.json({
        ...result,
        notice:
          "Entity-resolution links are candidate duplicates only. They do not verify company identity.",
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
      res.status(502).json({ error: "akif_entity_resolution_failed" });
    }
  },
);

router.post(
  "/admin/akif/intelligence/trade/comtrade/preview",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = comtradePreviewSchema.parse(req.body);
      const result = await previewAkifComtrade(input);
      res.json({
        ...result,
        notice:
          "UN Comtrade statistics are source evidence for analysis, not proof of a specific company's activity or verification status.",
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
      res.status(502).json({ error: "akif_comtrade_request_failed" });
    }
  },
);

export default router;
