// Groq as the backup conversation provider (owner's model order, 28 Oct:
// 1 Sonnet main brain, 2 Haiku normal replies, 3 Groq backup). Inert unless
// GROQ_API_KEY is set - no key, no traffic, no spend. Gemini stays off.
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
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
  if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}`);
  const raw = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = raw.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq returned no text response');
  return { content, raw };
}
