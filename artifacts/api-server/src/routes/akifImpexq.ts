import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../auth/middleware";
import {
  callImpexqHsnSandbox,
  getImpexqStatus,
  isImpexqConfigured,
} from "../akif/intelligence/impexqClient";

const router: IRouter = Router();

const sandboxPayloadSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

router.get(
  "/admin/akif/impexq/status",
  requireRole("admin"),
  (_req, res) => {
    res.json({
      ...getImpexqStatus(),
      notice:
        "AKIF keeps ImpexQ sandbox data separate from verification. Buyer-data integration remains disabled until Enterprise API access and licensing are confirmed.",
    });
  },
);

router.post(
  "/admin/akif/impexq/hsn",
  requireRole("admin"),
  async (req, res) => {
    if (!isImpexqConfigured()) {
      res.status(503).json({
        error: "impexq_not_configured",
        requiredEnvironmentVariables: ["IMPEXQ_API_KEY"],
      });
      return;
    }

    try {
      const input = sandboxPayloadSchema.parse(req.body);
      res.json(await callImpexqHsnSandbox(input.payload));
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

      res.status(502).json({
        error: "impexq_sandbox_request_failed",
      });
    }
  },
);

export default router;
