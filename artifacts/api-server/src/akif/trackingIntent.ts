// Brain-led tracking intent (owner direction 2 Nov): AKIF's own brain decides
// whether a free-text message asks about a shipment - any wording, any
// language, mixed Malayalam/English - and pulls the number out. No phrase
// lists here. Code keeps the safety checks: a digit must be present (every
// carrier number has one), the message must be short, the extracted value
// must pass the same carrier-number format check as the typed "track ..."
// command, and the caller's verified-user gate still applies downstream.
import { runConversationChat, isAkifBrainConfigured } from './intelligence/hermesClient.ts';
import type { TrackingBrainChat } from './shipmentTrackingReply.ts';

const MAX_ASK_CHARS = 300;
// Same shape liveTrackingReply accepts: 5-50 chars, letters/digits/dashes, at
// least one digit. The brain proposes; code disposes.
const NUMBER_SHAPE = /^[A-Z0-9][A-Z0-9-]{3,48}[A-Z0-9]$/;

function extractNumber(raw: string): string | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try {
    const data: unknown = JSON.parse(trimmed);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    value = (data as { trackingNumber?: unknown }).trackingNumber;
  } catch {
    return null;
  }
  if (typeof value !== 'string') return null;
  const number = value.trim().toUpperCase().replace(/\s+/g, '');
  return NUMBER_SHAPE.test(number) && /\d/.test(number) ? number : null;
}

/**
 * Returns the carrier tracking number when the message is clearly a tracking
 * ask with a number in it, else null (the message keeps its normal path -
 * including "where is my shipment" without a number, which the general
 * conversation already handles by asking for the number).
 */
export async function interpretTrackingAsk(
  text: string | null | undefined,
  deps: { chat?: TrackingBrainChat } = {},
): Promise<string | null> {
  const message = (text ?? '').trim();
  if (!message || message.length > MAX_ASK_CHARS || !/\d/.test(message)) return null;
  const chat = deps.chat ?? (isAkifBrainConfigured()
    ? (m: string, s: string) => runConversationChat(m, s)
    : null);
  if (!chat) return null;

  const system = [
    'You read one WhatsApp message sent to UDC, a trade platform, and decide one thing: is the sender asking where their shipment, cargo, container, package or delivery is, or asking to track it - in any language or mix of languages, including Malayalam and English?',
    'If yes AND the message contains a shipment tracking, container, BL or airway bill number, return {"trackingNumber":"THE_NUMBER"} with the number exactly as written, letters and digits only with dashes kept. If the message is a tracking ask with no number, or not a tracking ask at all, return {"trackingNumber":null}. Never invent or complete a number. Never answer the question itself.',
    'Return exactly one valid JSON object and nothing else.',
  ].join(' ');

  try {
    const { content } = await chat(JSON.stringify({ message, requiredOutput: '{"trackingNumber":"...or null"}' }), system);
    const number = extractNumber(content);
    if (!number) return null;
    const supplied: string[] = [...message.toUpperCase().matchAll(/[\p{L}\p{N}\p{M}-]+/gu)].map(match => match[0]);
    return supplied.includes(number) ? number : null;
  } catch {
    return null;
  }
}
