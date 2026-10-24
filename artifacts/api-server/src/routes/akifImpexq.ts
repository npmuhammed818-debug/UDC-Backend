import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../auth/middleware";
import {
  callImpexqSandbox,
  callImpexqFtaSandbox,
  getImpexqStatus,
  isImpexqConfigured,
} from "../akif/intelligence/impexqClient";

const router: IRouter = Router();

const sandboxPayloadSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

router.get("/admin/akif/impexq/status", requireRole("admin"), (_req, res) => {
  res.json({
    ...getImpexqStatus(),
    notice:
      "AKIF keeps ImpexQ sandbox data separate from verification. Buyer-data integration remains disabled until Enterprise API access and licensing are confirmed.",
  });
});

// One predictable, read-only sandbox query per button press. Never return the
// API key, raw provider response, query internals, or customer information.
const lastImpexqTestByAdmin = new Map<string, number>();
const TEST_COOLDOWN_MS = 60_000;

router.post("/admin/akif/impexq/test", requireRole("admin"), async (req, res) => {
  if (!isImpexqConfigured()) {
    res.status(503).json({ ok: false, error: "impexq_not_configured" });
    return;
  }
  const adminId = req.authUser!.id;
  const now = Date.now();
  // Prune stale entries to bound memory in a long-lived server process.
  for (const [key, timestamp] of lastImpexqTestByAdmin) {
    if (now - timestamp >= TEST_COOLDOWN_MS) lastImpexqTestByAdmin.delete(key);
  }
  const previous = lastImpexqTestByAdmin.get(adminId);
  if (previous !== undefined && now - previous < TEST_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((TEST_COOLDOWN_MS - (now - previous)) / 1000);
    res.set("Retry-After", String(waitSeconds))
      .status(429).json({ ok: false, error: "test_cooldown", retryAfterSeconds: waitSeconds });
    return;
  }
  lastImpexqTestByAdmin.set(adminId, now);
  try {
    const result = await callImpexqFtaSandbox({ destination: "uae", query: "basmati rice" });
    const data = result.data as Record<string, unknown>;
    const callsRemaining = typeof data._callsRemaining === "number" &&
      Number.isFinite(data._callsRemaining) && data._callsRemaining >= 0
        ? data._callsRemaining : null;
    res.set("Cache-Control", "no-store").json({
      ok: true,
      configured: true,
      provider: "impexq",
      mode: "sandbox",
      tool: "fta",
      mock: result.mock,
      productionReady: false,
      callsRemaining,
      testedAt: result.retrievedAt,
      message: result.mock
        ? "Connected. Sandbox response is simulated and cannot verify a live duty rate."
        : "Connected. FTA provider reference returned; trade eligibility remains unverified.",
    });
  } catch (error) {
    const code = (error as { providerStatus?: unknown }).providerStatus;
    const reason = code === 401 || code === 403 ? "key_rejected_or_inactive"
      : code === 429 ? "provider_quota_or_rate_limit"
      : "provider_unavailable";
    res.set("Cache-Control", "no-store").status(502).json({ ok: false, error: reason });
  }
});

for (const tool of ["hsn", "rodtep", "fta", "calculator"] as const) {
  router.post(
    `/admin/akif/impexq/${tool}`,
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
        res.json(await callImpexqSandbox(tool, input.payload));
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
}

export default router;
