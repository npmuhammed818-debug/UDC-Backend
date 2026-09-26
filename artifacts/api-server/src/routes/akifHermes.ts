import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  akifLearningEventsTable,
  db,
} from "@workspace/db";
import { requireRole } from "../auth/middleware";
import {
  getHermesCapabilities,
  isHermesAkifConfigured,
  runHermesSkillReviewCommand,
} from "../akif/intelligence/hermesClient";
import {
  learnFromAdminFeedback,
  learnFromResearchRun,
} from "../akif/intelligence/hermesLearning";

const router: IRouter = Router();

const feedbackSchema = z.object({
  researchRunId: z.string().uuid().optional(),
  feedback: z.string().trim().min(3).max(10_000),
}).strict();

const reviewActionSchema = z.object({
  action: z.enum(["pending", "diff", "approve", "reject"]),
  id: z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action !== "pending" && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "id is required for diff, approve, or reject",
      path: ["id"],
    });
  }
});

router.get("/admin/akif/hermes/status", requireRole("admin"), async (_req, res) => {
  if (!isHermesAkifConfigured()) {
    res.json({
      configured: false,
      requiredEnvironmentVariables: [
        "HERMES_AKIF_URL",
        "HERMES_AKIF_API_KEY",
      ],
    });
    return;
  }

  try {
    res.json({
      configured: true,
      capabilities: await getHermesCapabilities(),
      learningPolicy: {
        skillsWriteApproval: true,
        memoryWriteApproval: true,
        transactionAuthority: false,
      },
    });
  } catch {
    res.status(502).json({
      error: "akif_hermes_unavailable",
      configured: true,
    });
  }
});

router.post(
  "/admin/akif/hermes/learn/research/:runId",
  requireRole("admin"),
  async (req, res) => {
    try {
      const runId = z.string().uuid().parse(req.params["runId"]);
      const result = await learnFromResearchRun({
        researchRunId: runId,
        requestedBy: req.authUser!.id,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      const message = error instanceof Error ? error.message : "unknown_error";
      if (message === "research_run_not_found") {
        res.status(404).json({ error: message });
        return;
      }
      if (message === "research_run_not_completed") {
        res.status(409).json({ error: message });
        return;
      }
      if (message === "hermes_not_configured") {
        res.status(503).json({ error: message });
        return;
      }
      res.status(502).json({ error: "akif_hermes_learning_failed" });
    }
  },
);

router.post(
  "/admin/akif/hermes/learn/feedback",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = feedbackSchema.parse(req.body);
      res.json(
        await learnFromAdminFeedback({
          requestedBy: req.authUser!.id,
          researchRunId: input.researchRunId,
          feedback: input.feedback,
        }),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      const message = error instanceof Error ? error.message : "unknown_error";
      if (message === "hermes_not_configured") {
        res.status(503).json({ error: message });
        return;
      }
      res.status(502).json({ error: "akif_hermes_feedback_failed" });
    }
  },
);

router.post(
  "/admin/akif/hermes/skills/review",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = reviewActionSchema.parse(req.body);
      const response = await runHermesSkillReviewCommand(input.action, input.id);

      const [event] = await db
        .insert(akifLearningEventsTable)
        .values({
          requestedBy: req.authUser!.id,
          eventType: `skill_${input.action}`,
          status:
            input.action === "approve"
              ? "approved"
              : input.action === "reject"
                ? "rejected"
                : "reviewed",
          skillChangeId: input.id,
          inputSummary: `${input.action}${input.id ? ` ${input.id}` : ""}`,
          hermesResponse: {
            content: response.content,
            raw: response.raw,
          },
          reviewedAt:
            input.action === "approve" || input.action === "reject"
              ? new Date()
              : undefined,
        })
        .returning();

      res.json({ event, hermes: response.content });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      res.status(502).json({ error: "akif_hermes_skill_review_failed" });
    }
  },
);

router.get(
  "/admin/akif/hermes/learning-events",
  requireRole("admin"),
  async (req, res) => {
    try {
      const limit = z.coerce.number().int().min(1).max(200)
        .default(50)
        .parse(req.query["limit"]);
      const events = await db
        .select()
        .from(akifLearningEventsTable)
        .orderBy(desc(akifLearningEventsTable.createdAt))
        .limit(limit);
      res.json({ events });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      res.status(500).json({ error: "akif_learning_events_failed" });
    }
  },
);

router.get(
  "/admin/akif/hermes/learning-events/:eventId",
  requireRole("admin"),
  async (req, res) => {
    try {
      const eventId = z.string().uuid().parse(req.params["eventId"]);
      const [event] = await db
        .select()
        .from(akifLearningEventsTable)
        .where(eq(akifLearningEventsTable.id, eventId))
        .limit(1);
      if (!event) {
        res.status(404).json({ error: "learning_event_not_found" });
        return;
      }
      res.json({ event });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error" });
        return;
      }
      res.status(500).json({ error: "akif_learning_event_failed" });
    }
  },
);

export default router;
