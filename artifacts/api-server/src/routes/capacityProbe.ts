import { Router, type IRouter } from "express";
import { requireRole } from "../auth/middleware";
import { isStagingEnv } from "../testPrincipal";
import { udcHandbookForRole } from "../akif/udcHandbook";
import { groqModel } from "../akif/intelligence/groqClient";

/**
 * TEMPORARY synthetic capacity probe (user ask 16:51, "fake test of how many messages / hours").
 * Admin only, staging only, fixed synthetic input, no customer context, no sends, no tools, no backups.
 * Hard limits: at most 8 calls per run, strictly sequential (concurrency 1), 25 s timeout per call,
 * one run at a time, 10 minute cooldown between runs, max 120 output tokens per call.
 * Reads the provider response headers so the actual account limits are observed, not assumed.
 * The key never leaves the server. Remove this file and its router.use line after the measurement.
 */
const router: IRouter = Router();
const MAX_CALLS = 8;
const COOLDOWN_MS = 10 * 60_000;
let running = false;
let lastRunAt = 0;
const wanted = ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-tokens", "x-ratelimit-reset-tokens", "retry-after"];

router.post("/admin/capacity-probe", requireRole("admin"), async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!isStagingEnv()) { res.sendStatus(404); return; }
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) { res.status(503).json({ error: "groq_not_configured" }); return; }
  if (running) { res.status(409).json({ error: "probe_running" }); return; }
  if (Date.now() - lastRunAt < COOLDOWN_MS) { res.status(429).json({ error: "probe_cooldown", retryInSeconds: Math.ceil((COOLDOWN_MS - (Date.now() - lastRunAt)) / 1000) }); return; }
  const requested = Number((req.body as { calls?: unknown } | undefined)?.calls);
  const calls = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_CALLS) : 5;
  running = true; lastRunAt = Date.now();
  const baseUrl = (process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const system = udcHandbookForRole("buyer");
  const prompts = [
    "Synthetic test. A buyer asks: what does CIF mean in one sentence?",
    "Synthetic test. A seller asks: which documents are checked before a deal? Answer briefly.",
    "Synthetic test. Someone says hello. Reply with a short greeting.",
    "Synthetic test. Explain DLC in one sentence.",
    "Synthetic test. What is the safest payment method? Answer in two sentences.",
    "Synthetic test. Explain FOB in one sentence.",
    "Synthetic test. What is an agent on UDC? One sentence.",
    "Synthetic test. Say thanks and ask how you can help.",
  ];
  const samples: Array<Record<string, unknown>> = [];
  try {
    for (let i = 0; i < calls; i++) {
      const started = Date.now();
      const sample: Record<string, unknown> = { n: i + 1 };
      try {
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(25_000),
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: groqModel(), temperature: 0.3, max_tokens: 120, messages: [{ role: "system", content: system }, { role: "user", content: prompts[i % prompts.length] }] }),
        });
        sample.status = r.status;
        sample.latencyMs = Date.now() - started;
        const headers: Record<string, string> = {};
        for (const h of wanted) { const v = r.headers.get(h); if (v) headers[h] = v; }
        sample.headers = headers;
        if (r.ok) {
          const body = await r.json() as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
          sample.usage = body.usage ?? null;
        } else {
          sample.errorText = (await r.text()).slice(0, 160);
          samples.push(sample);
          break; // stop at the first failure: never push into a limit
        }
      } catch (err) {
        sample.latencyMs = Date.now() - started;
        sample.error = err instanceof Error ? err.name : "error";
        samples.push(sample);
        break;
      }
      samples.push(sample);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally { running = false; }
  res.json({ scope: "route-only: production Groq key and model, handbook-size system prompt, no tools, no customer context, concurrency 1", model: groqModel(), calls: samples.length, samples });
});

export default router;
