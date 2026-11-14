// Gemini as the last-backup conversation slot (owner's brain order, 31 Oct:
// 1 Sonnet deep, 2 Haiku fast, 3 AKIF own brain, 4 Gemini backup). Inert unless
// GEMINI_API_KEY is set - no key, no traffic, no spend.
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export async function runGeminiChat(
  message: string,
  system: string | undefined,
  timeoutMs: number,
): Promise<{ content: string; raw: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('Gemini is not configured');
  const baseUrl = (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${baseUrl}/models/${geminiModel()}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
  const raw = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const content = raw.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!content) throw new Error('Gemini returned no text response');
  return { content, raw };
}
