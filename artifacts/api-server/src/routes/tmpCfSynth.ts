// TEMPORARY: bounded synthetic Workers AI check. Removed right after the live test.
import { Router, type IRouter } from "express";
import { requireRole } from "../auth/middleware";

const router: IRouter = Router();
let used = false;

router.post("/admin/akif/cf-synth-test", requireRole("admin"), async (_req, res) => {
  if (used) { res.status(429).json({ error: "already_run" }); return; }
  used = true;
  const acct = process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim();
  const tok = process.env.CLOUDFLARE_AI_TOKEN?.trim();
  if (!acct || !tok) { res.status(503).json({ error: "not_configured" }); return; }
  const tools = [{ type: "function", function: { name: "get_price", description: "Get the price of a product", parameters: { type: "object", properties: { product: { type: "string" } }, required: ["product"] } } }];
  const cases = [
    { model: "@cf/openai/gpt-oss-120b", name: "plain", messages: [{ role: "user", content: "Reply with one short sentence: what is 2+3?" }] },
    { model: "@cf/openai/gpt-oss-120b", name: "tool", tools, messages: [{ role: "user", content: "What is the price of basmati rice? Use the tool." }] },
    { model: "@cf/openai/gpt-oss-20b", name: "plain", messages: [{ role: "user", content: "Reply with one short sentence: what is 2+3?" }] },
    { model: "@cf/openai/gpt-oss-20b", name: "tool", tools, messages: [{ role: "user", content: "What is the price of basmati rice? Use the tool." }] },
  ];
  const out: unknown[] = [];
  for (const c of cases) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/v1/chat/completions`, {
        method: "POST", signal: AbortSignal.timeout(25000),
        headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ model: c.model, messages: c.messages, ...(c.tools ? { tools: c.tools } : {}), max_tokens: 200 }),
      });
      const t = await r.text();
      let j: any = null; try { j = JSON.parse(t); } catch {}
      const m = j?.choices?.[0]?.message;
      out.push({ model: c.model, case: c.name, http: r.status, content: String(m?.content ?? "").slice(0, 120), toolCall: m?.tool_calls?.[0]?.function?.name ?? null, usage: j?.usage ?? null, err: r.ok ? undefined : t.slice(0, 200).replace(/[A-Za-z0-9_-]{32,}/g, "[x]") });
    } catch (e) { out.push({ model: c.model, case: c.name, error: e instanceof Error ? e.name : "error" }); }
  }
  res.json({ results: out });
});

export default router;
