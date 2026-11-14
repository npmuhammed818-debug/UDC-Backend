// Ranked free-provider fallback chain for conversation text. Each provider is
// OpenAI-compatible, inert without its API key, and wrapped in a circuit
// breaker so a failing or rate-limited provider is skipped for a cool-down
// instead of burning the caller's deadline. Order is the rank.
type ChainProvider = {
  id: string;
  keyEnv: string;
  baseUrl: string | (() => string | null);
  modelEnv: string;
  defaultModel: string;
};

export const FREE_CHAIN: ChainProvider[] = [
  {
    id: "cloudflare", keyEnv: "CLOUDFLARE_AI_TOKEN", modelEnv: "CLOUDFLARE_AI_MODEL", defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    baseUrl: () => {
      const account = process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim();
      return account ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1` : null;
    },
  },
  { id: "cerebras", keyEnv: "CEREBRAS_API_KEY", baseUrl: "https://api.cerebras.ai/v1", modelEnv: "CEREBRAS_MODEL", defaultModel: "gpt-oss-120b" },
  { id: "sambanova", keyEnv: "SAMBANOVA_API_KEY", baseUrl: "https://api.sambanova.ai/v1", modelEnv: "SAMBANOVA_MODEL", defaultModel: "gpt-oss-120b" },
  { id: "mistral", keyEnv: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", modelEnv: "MISTRAL_MODEL", defaultModel: "mistral-small-latest" },
  { id: "openrouter", keyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", modelEnv: "OPENROUTER_MODEL", defaultModel: "openai/gpt-oss-120b:free" },
];

const COOLDOWN_MS = 60_000;
const FAIL_THRESHOLD = 2;
const state = new Map<string, { fails: number; openUntil: number }>();

export function resetFreeChainBreakers() { state.clear(); }

export function configuredFreeProviders(now = Date.now()): ChainProvider[] {
  return FREE_CHAIN.filter(p => {
    if (!process.env[p.keyEnv]?.trim()) return false;
    if (typeof p.baseUrl === "function" && !p.baseUrl()) return false;
    const s = state.get(p.id);
    return !s || s.openUntil <= now;
  });
}

function record(id: string, ok: boolean) {
  const s = state.get(id) ?? { fails: 0, openUntil: 0 };
  if (ok) { state.set(id, { fails: 0, openUntil: 0 }); return; }
  s.fails += 1;
  if (s.fails >= FAIL_THRESHOLD) s.openUntil = Date.now() + COOLDOWN_MS;
  state.set(id, s);
}

export async function runFreeChain(
  message: string,
  system: string | undefined,
  budgetMs: () => number,
): Promise<{ content: string; raw: unknown; provider: string } | null> {
  for (const p of configuredFreeProviders()) {
    try {
      const timeout = Math.min(budgetMs(), 25_000);
      const base = typeof p.baseUrl === "function" ? p.baseUrl() : p.baseUrl;
      if (!base) throw new Error("no base url");
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(timeout),
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env[p.keyEnv]!.trim()}` },
        body: JSON.stringify({
          model: process.env[p.modelEnv]?.trim() || p.defaultModel,
          messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: message }],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = raw.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("empty");
      record(p.id, true);
      return { content, raw, provider: p.id };
    } catch (error) {
      record(p.id, false);
      console.warn("Free chain provider failed", { provider: p.id, reason: error instanceof Error ? error.message.slice(0, 40) : "error" });
    }
  }
  return null;
}
