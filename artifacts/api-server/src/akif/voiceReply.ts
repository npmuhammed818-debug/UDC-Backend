import { AI_FALLBACK_REPLY, HUMAN_HANDOFF_REPLY } from "./conversationPolicy.ts";

// Fixed reviewed sentences may always be spoken. Conversational replies may also be spoken, but only
// when they pass the privacy rules below (the same rules run again in the worker). Anything that
// fails stays text-only, so details, links, codes and approval prompts are never turned into audio.
export const SPEAKABLE_STATIC_REPLIES: ReadonlySet<string> = new Set([HUMAN_HANDOFF_REPLY, AI_FALLBACK_REPLY]);

export const MAX_SPOKEN_CHARS = 600;

export function speechTextAllowed(text: string | null | undefined): boolean {
  return typeof text === "string" && SPEAKABLE_STATIC_REPLIES.has(text);
}

// Mirror of services/akif-worker/app/speech.py conversational_text_ok; a test keeps them aligned.
const BLOCKED_PATTERNS: RegExp[] = [
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|in|io|site|app|co)\b\/?/i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  /\b(?:otp|one[- ]time|passcode|password|passphrase|cvv|pin)\b/i,
  /\b(?:iban|swift|ifsc|bank account|account number|routing number|card number|aadhaar|aadhar|passport)\b/i,
  /\b(?:vault|sign[- ]?in code|verification code|upload link)\b/i,
  /\b(?:reply|type|send|say)\s+(?:yes|confirm|approve|accept)\b/i,
  /\b(?:please confirm|needs? your approval|approve (?:this|the)|awaiting your approval)\b/i,
];

export function conversationalSpeechAllowed(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_SPOKEN_CHARS) return false;
  if (/\d{7,}/.test(trimmed.replace(/[\s().-]/g, ""))) return false; // phone, account, tracking-length numbers
  return !BLOCKED_PATTERNS.some(pattern => pattern.test(trimmed));
}

export function voiceRepliesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env["AKIF_VOICE_REPLIES"] === "on";
}

/** Conversational voice is on with the master switch unless AKIF_VOICE_CONVERSATIONAL=off (back to fixed sentences only). */
export function conversationalVoiceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return voiceRepliesEnabled(env) && env["AKIF_VOICE_CONVERSATIONAL"] !== "off";
}

export type ReplyClass = "warm" | "mixed" | "critical";

const CRITICAL_TERMS = /[$\u20ac\u00a3\u20b9]|\b(?:usd|inr|eur|aed|price|per\s+(?:mt|ton|tonne|kg|unit)|invoice|contract|payment|terms?|incoterm|address|quantity|moq|dlc|deadline|delivery date)\b/i;

/**
 * Human-style choice: warm or explanatory replies may be spoken; exact details stay text. Unsure means text.
 *  warm: no digits. mixed: some digits but nothing that looks like a price, term or address (still speakable).
 *  critical: blocked content (links, codes, bank/ID words, approval prompts), too long, a list, or numbers with money or term words.
 */
export function classifyReply(text: string | null | undefined): ReplyClass {
  try {
    if (speechTextAllowed(text)) return "warm";
    if (!conversationalSpeechAllowed(text)) return "critical";
    const t = (text as string).trim();
    const hasDigit = /\d/.test(t);
    if (hasDigit && CRITICAL_TERMS.test(t)) return "critical";
    if (/\n\s*(?:[-*\u2022]|\d+[.)])\s/.test(t) || t.split("\n").filter(line => line.trim()).length > 3) return "critical";
    return hasDigit ? "mixed" : "warm";
  } catch { return "critical"; }
}

export type SpeechKind = "static" | "conversational" | "none";

export function speechKind(reply: string | null | undefined, env: Record<string, string | undefined> = process.env): SpeechKind {
  if (!voiceRepliesEnabled(env)) return "none";
  if (speechTextAllowed(reply)) return "static";
  return conversationalVoiceEnabled(env) && classifyReply(reply) !== "critical" ? "conversational" : "none";
}

/** Audio only when the user spoke to us, the feature is on, and the text is fixed or passes the privacy rules. */
export function shouldSpeakReply(input: { userSentVoice: boolean; reply: string | null | undefined; enabled?: boolean; env?: Record<string, string | undefined> }): boolean {
  if (!input.userSentVoice) return false;
  const env = { ...(input.env ?? process.env), ...(input.enabled === undefined ? {} : { AKIF_VOICE_REPLIES: input.enabled ? "on" : "off" }) };
  return speechKind(input.reply, env) !== "none";
}
