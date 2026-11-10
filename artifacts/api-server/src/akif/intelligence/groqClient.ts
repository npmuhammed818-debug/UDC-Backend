// Groq as the backup conversation provider (owner's model order, 28 Oct:
// 1 Sonnet main brain, 2 Haiku normal replies, 3 Groq backup). Inert unless
// GROQ_API_KEY is set - no key, no traffic, no spend. Gemini stays off.
// llama-3.3-70b-versatile shut down 2026-08-16 (Groq deprecations page, free
// and developer tiers); Groq's recommended replacement is gpt-oss-120b. It
// supports tool use (one call per turn - no parallel calls). GROQ_MODEL
// overrides.
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

// Owner direction 10 Nov: Groq is OFF everywhere (chat, background guidance/
// emotion calls, backups) until he says otherwise - the free tier is rate
// limited and the workers answer everything. Set AKIF_GROQ=on to re-enable.
export function isGroqConfigured(): boolean {
  return process.env.AKIF_GROQ === "on" && Boolean(process.env.GROQ_API_KEY?.trim());
}

export function groqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

export async function runGroqChat(
  message: string,
  system: string | undefined,
  timeoutMs: number,
): Promise<{ content: string; raw: unknown }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('Groq is not configured');
  const baseUrl = (process.env.GROQ_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: groqModel(),
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: message }],
      temperature: 0.3,
    }),
  });
  if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const raw = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = raw.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq returned no text response');
  return { content, raw };
}

// Tool-calling variant for the brain orchestrator (owner direction, 7 Nov):
// AKIF's features are exposed to the model as tools. Still Groq-only, still
// inert without GROQ_API_KEY. The model can only ASK for an action; every
// tool executes through the existing code handlers and validators.
export type GroqToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type GroqToolChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};

export type GroqToolCall = { id: string; name: string; argumentsJson: string };

/** Smaller free-tier model with its own rate-limit bucket: when the main
 *  model is capped (429) the brain stays alive on the fallback model
 *  (launch night, 10 Nov). GROQ_FALLBACK_MODEL overrides; empty disables. */
export function groqFallbackModel(): string {
  const raw = process.env.GROQ_FALLBACK_MODEL;
  if (raw !== undefined) return raw.trim();
  return 'openai/gpt-oss-20b';
}

export async function runGroqToolChat(
  messages: GroqToolChatMessage[],
  tools: GroqToolDefinition[],
  timeoutMs: number,
): Promise<{ content: string | null; toolCalls: GroqToolCall[] }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('Groq is not configured');
  const baseUrl = (process.env.GROQ_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const call = (model: string) => fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    }),
  });
  let response = await call(groqModel());
  const fallback = groqFallbackModel();
  if (response.status === 429 && fallback && fallback !== groqModel()) {
    console.warn('Groq main model rate-limited; retrying on the fallback model', { model: groqModel(), fallback });
    response = await call(fallback);
  }
  if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const raw = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };
  const message = raw.choices?.[0]?.message;
  if (!message) throw new Error('Groq returned no message');
  const toolCalls = (message.tool_calls ?? [])
    .filter((call): call is { id: string; type: string; function: { name: string; arguments: string } } =>
      typeof call?.id === 'string' && typeof call?.function?.name === 'string' && typeof call?.function?.arguments === 'string')
    .map((call) => ({ id: call.id, name: call.function.name, argumentsJson: call.function.arguments }));
  const content = typeof message.content === 'string' && message.content.trim() ? message.content.trim() : null;
  if (!content && toolCalls.length === 0) throw new Error('Groq returned an empty turn');
  return { content, toolCalls };
}
