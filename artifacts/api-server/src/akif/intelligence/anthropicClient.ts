// Anthropic (Claude) as the optional strong model for AKIF's profile brain and
// hard turns. Fully inert unless AKIF_BRAIN_MODEL_PROVIDER=anthropic AND
// ANTHROPIC_API_KEY are both set - no key, no traffic, no spend. Gemini stays
// off for real customer chats (owner rule, 26 Oct).
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export function isAnthropicStrongModelEnabled(): boolean {
  return process.env.AKIF_BRAIN_MODEL_PROVIDER?.trim().toLowerCase() === 'anthropic'
    && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function anthropicStrongModel(): string {
  return process.env.ANTHROPIC_STRONG_MODEL?.trim() || DEFAULT_MODEL;
}

export async function runAnthropicChat(
  message: string,
  system: string | undefined,
  timeoutMs: number,
): Promise<{ content: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Anthropic strong model not configured');
  const baseUrl = (process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: anthropicStrongModel(),
      max_tokens: 800,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic returned HTTP ${response.status}`);
  const raw = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const content = (raw.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (!content) throw new Error('Anthropic returned no text response');
  return { content };
}
