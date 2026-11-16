import { Router, type IRouter } from "express";
import { requireRole } from "../auth/middleware";
import { isTestWorldEnabled, dbUrlTargetsTestWorld } from "../testPrincipal";
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
  if (!isTestWorldEnabled()) { res.sendStatus(404); return; }
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

/** TEMPORARY read-only config report (admin only). Enumerated flags show their value; everything else only
 *  set/unset plus the number of entries, never phone numbers, keys or URLs. Remove with this file. */
const VALUE_FLAGS = ["UDC_APP_ENV", "NODE_ENV", "AKIF_WHATSAPP_REPLY_SINK", "AKIF_PROACTIVE_ENABLED", "UDC_PRICE_WATCH_ENABLED", "UDC_DEAL_REMINDERS_ENABLED", "UDC_EMAIL_PILOT_MODE", "UDC_TESTER_MODE", "UDC_SHIPMENT_WATCH_ENABLED", "UDC_SHIPMENT_WATCH_FAKE_EVENTS", "UDC_OWNER_TEST_SWITCH", "UDC_CUSTOMER_BACKUP_ROUTES", "AKIF_HUMAN_RELAY_ENABLED", "AKIF_BRAIN_ORCHESTRATOR", "UDC_EMAIL_OUTBOUND", "UDC_EMAIL_RELAY_QUARANTINE", "UDC_INVITE_ONLY", "UDC_AUTH_EMAIL_SEND_ENABLED", "UDC_AUTH_EMAIL_TRANSPORT"];
const LIST_FLAGS = ["UDC_WHATSAPP_ONLY_TO", "AKIF_WHATSAPP_REPLY_ALLOWLIST", "UDC_ALLOWED_PHONES", "UDC_MUTED_PHONES", "UDC_TESTER_PHONES", "AKIF_HUMAN_RELAY_NUMBERS", "UDC_TEST_FIXTURE_IDS"];
router.get("/admin/runtime-flags", requireRole("admin"), (_req, res) => {
  res.set("Cache-Control", "no-store");
  const values: Record<string, string | null> = {};
  for (const k of VALUE_FLAGS) { const v = process.env[k]; values[k] = v === undefined ? null : v.length > 40 ? `[${v.length} chars]` : JSON.stringify(v); }
  const lists: Record<string, string> = {};
  for (const k of LIST_FLAGS) { const v = process.env[k]; lists[k] = v === undefined ? "unset" : `set, ${v.split(",").map((x) => x.trim()).filter(Boolean).length} entries`; }
  const OWNER = "917994133604";
  const ownerOnly: Record<string, string> = {};
  for (const k of LIST_FLAGS.filter((x) => x !== "UDC_TEST_FIXTURE_IDS")) {
    const v = process.env[k];
    if (v === undefined) { ownerOnly[k] = "unset"; continue; }
    const digits = v.split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean);
    ownerOnly[k] = digits.length === 0 ? "empty" : digits.every((d) => d === OWNER) ? "owner_only" : digits.includes(OWNER) ? "owner_plus_others" : "others_only";
  }
  const REF = "lfqmfozvdaszpbbropqo";
  const dbTarget: Record<string, boolean> = { SUPABASE_URL_is_staging_project: (process.env.SUPABASE_URL ?? "").includes(REF), SUPABASE_DATABASE_URL_is_staging_project: (process.env.SUPABASE_DATABASE_URL ?? "").includes(REF) };
  dbTarget["pool_url_targets_pinned_project"] = dbUrlTargetsTestWorld(process.env.SUPABASE_DATABASE_URL);
  res.json({ values, lists, ownerOnly, dbTarget, testWorld: { UDC_TEST_WORLD: process.env.UDC_TEST_WORLD ?? null, enabled: isTestWorldEnabled() }, note: "temporary read-only report; phone numbers, keys and URLs are never returned" });
});

export default router;
