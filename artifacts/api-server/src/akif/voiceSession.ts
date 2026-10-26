// Short-lived, in-memory voice state per user: a pending "text offer" and an explicit "answer in voice" request.
// Keys are hashed. Nothing here is persisted or logged; a restart simply drops a pending offer.
import { createHash } from "node:crypto";

const TTL_MS = 10 * 60_000;
const offers = new Map<string, { text: string; at: number }>();
const explicit = new Map<string, number>();
const key = (phone: string) => createHash("sha256").update("wa-voice-session:" + phone).digest("hex").slice(0, 24);

function trim(map: Map<string, unknown>) { if (map.size > 5000) map.delete(map.keys().next().value as string); }

export function setVoiceOffer(phone: string, text: string, now = Date.now()) { trim(offers); offers.set(key(phone), { text, at: now }); }

/** Returns the offered text if still fresh, and always clears the offer (any next message ends it). */
export function takeVoiceOffer(phone: string, now = Date.now()): string | null {
  const k = key(phone); const offer = offers.get(k); offers.delete(k);
  return offer && now - offer.at <= TTL_MS ? offer.text : null;
}

export function armExplicitVoice(phone: string, now = Date.now()) { trim(explicit); explicit.set(key(phone), now); }

export function consumeExplicitVoice(phone: string, now = Date.now()): boolean {
  const k = key(phone); const at = explicit.get(k); explicit.delete(k);
  return at !== undefined && now - at <= TTL_MS;
}

export function textOfferSeconds(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env["AKIF_VOICE_TEXT_OFFER_SECONDS"]);
  return Number.isFinite(n) && n > 0 && env["AKIF_VOICE_TEXT_OFFER_SECONDS"] ? n : 30;
}

export function resetVoiceSessionForTests() { offers.clear(); explicit.clear(); }
