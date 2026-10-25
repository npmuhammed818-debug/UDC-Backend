export type MessageAcknowledgement =
  | { delivered: true; messageId: string }
  | { delivered: false; reason: 'provider_outcome_unknown'; messageId?: undefined };

// A POST returning 2xx is not sufficient evidence of provider acceptance, and
// acceptance is never proof of delivery/read. Permit opaque Meta/base64 IDs,
// but reject empty, malformed, contradictory or multiple acknowledgements.
export function parseMessageAcknowledgement(payload: unknown): MessageAcknowledgement {
  const unknown = { delivered: false as const, reason: 'provider_outcome_unknown' as const };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || 'error' in payload) return unknown;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length !== 1 || !messages[0] || typeof messages[0] !== 'object') return unknown;
  const id = (messages[0] as { id?: unknown }).id;
  return typeof id === 'string' && /^[A-Za-z0-9_.:+/=-]{5,255}$/.test(id)
    ? { delivered: true, messageId: id } : unknown;
}

export async function readMetaJson(response: Response, limit = 16_384): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_meta_response');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw Error('oversized_meta_response'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Callers must not turn malformed 2xx responses into retryable pre-send errors.
export async function readMessageAcknowledgement(response: Response): Promise<MessageAcknowledgement> {
  try { return parseMessageAcknowledgement(await readMetaJson(response)); }
  catch { return { delivered: false, reason: 'provider_outcome_unknown' }; }
}
