import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sendRelayHeldAlert } from "./relayAlertEmail.ts";

// Owner-approved 10 Nov: simple greetings (hi/hello/how are you and nothing
// more) may be auto-answered on staging for allowlisted numbers. Env-gated,
// default OFF. Anything with trade, money, deals, questions or any doubt
// stays on the human hold. Fail closed: only the exact patterns below count.
/** Decoded Ogg bytes or null. Only real Ogg containers (Opus voice notes) pass. */
export function decodeRelayAudio(audioBase64: string): Uint8Array | null {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(Buffer.from(audioBase64, "base64")); } catch { return null; }
  if (bytes.length < 27 || bytes.length > 16 * 1024 * 1024) return null;
  if (bytes[0] !== 0x4f || bytes[1] !== 0x67 || bytes[2] !== 0x67 || bytes[3] !== 0x53) return null; // "OggS"
  return bytes;
}

export function relayAutoGreetingsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AKIF_RELAY_AUTO_GREETINGS ?? "").trim() === "on";
}

// Owner-approved 10 Nov: acknowledgements (ok, thanks, noted) get a WhatsApp
// reaction instead of a text reply - and no typing bubble, no hold wait.
export function relayAckReactionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AKIF_RELAY_ACK_REACTIONS ?? "").trim() === "on";
}

// Owner-approved 10 Nov: when the brain actually used its tools for the
// answer, that answer may go straight out (staging allowlist only) instead of
// waiting on the human hold. Tool-less replies still hold.
export function relayAutoToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AKIF_RELAY_AUTO_TOOLS ?? "").trim() === "on";
}

const ACK_WORDS = /^(?:ok(?:ay)?|okie?s?|k+|thanks?(?:\s+you)?(?:\s+so\s+much)?|thankyou|thx|ty|noted|got\s?it|cool|great|nice|super|fine|hmm+|hmm\s+ok|👍+|🙏+|❤️+|❤|done)[\s!.,]*$/i;

/** True only when the whole message is a bare acknowledgement. */
export function isAcknowledgementText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 30 && ACK_WORDS.test(t);
}

export function ackEmojiFor(text: string): string {
  return /thank|thx|ty|nanni|shukriya/i.test(text) ? "🙏" : "👍";
}

/** Auto-send check for tool-backed replies: the brain's own validators already
 *  ran. Links and reference numbers are allowed ONLY when a tool really ran
 *  (they come from tool output) - a tool-less reply with a link is exactly the
 *  invented-link failure mode and never auto-sends. */
export function relayAutoToolReplySafe(reply: string | null | undefined, toolsUsed: string[]): reply is string {
  if (!reply || toolsUsed.length === 0) return false;
  const t = reply.trim();
  if (t.length === 0 || t.length > 600) return false;
  if (/\bmenu\b/i.test(t)) return false;
  return true;
}

const GREETING_PARTS = [
  "hi+", "hello+", "hey+", "hai+", "hii+", "yo",
  "good\\s+(?:morning|afternoon|evening|night)",
  "namaste", "namaskaram", "salaam?", "assalamu\\s+alaikum",
  "how\\s+(?:are|r)\\s+(?:you|u)", "how'?s\\s+it\\s+going", "what'?s\\s+up", "sup",
];
const SIMPLE_GREETING = new RegExp(
  `^\\s*(?:${GREETING_PARTS.join("|")})(?:[\\s,!.?…]+(?:${GREETING_PARTS.join("|")}))*[\\s,!.?…]*$`,
  "i",
);

/** True only when the whole message is greeting words - nothing else. */
export function isSimpleGreetingText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 60 && SIMPLE_GREETING.test(t);
}

/** The brain already validated the draft; this is the belt-and-braces check
 *  before anything auto-sends: short, no links, emails, long numbers, no menu. */
export function greetingAutoReplySafe(draft: string | null | undefined): draft is string {
  if (!draft) return false;
  const t = draft.trim();
  if (t.length === 0 || t.length > 300) return false;
  if (/https?:\/\/|www\.|\S+@\S+|\d{5,}/i.test(t)) return false;
  if (/\bmenu\b/i.test(t)) return false;
  return true;
}

// Human relay (staging tests only; owner direction, 9 Nov): open chat turns
// from allowlisted test numbers are held in memory for a dev-side human answer
// instead of AKIF answering straight away. Deal commands, menus, forms, money
// and verification paths keep their scripted gates and never relay. Default
// OFF; pending items live in memory only, so a restart drops them and nothing
// is written to the database by this module.

const MAX_ITEMS = 200;
const MAX_PER_PHONE = 20;
const ITEM_TTL_MS = 6 * 60 * 60 * 1000;
export const HUMAN_RELAY_MAX_REPLY_CHARS = 1500;
const REPLY_WINDOW_MS = 60_000;
const REPLY_MAX_PER_WINDOW = 10;

export type HumanRelayItem = {
  id: string;
  phone: string; // digits only
  at: string;
  kind: "text" | "voice";
  text: string;
  heardLanguage?: string;
  draft: string | null;
  draftBackgroundDiscarded: boolean;
  answeredAt: string | null;
};

const items: HumanRelayItem[] = [];
const replyWindow: number[] = [];

export function humanRelayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AKIF_HUMAN_RELAY_ENABLED === "true";
}

/** Digits-only allowlist of test numbers whose open chat turns are held. */
export function humanRelayNumbers(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.AKIF_HUMAN_RELAY_NUMBERS ?? "")
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter((s) => s.length >= 8);
}

export function humanRelayActiveFor(phone: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!humanRelayEnabled(env)) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && humanRelayNumbers(env).includes(digits);
}

export function pruneHumanRelay(now = Date.now()): void {
  while (items.length && now - Date.parse(items[0].at) > ITEM_TTL_MS) items.shift();
}

export function enqueueHumanRelay(input: {
  phone: string;
  kind: "text" | "voice";
  text: string;
  heardLanguage?: string;
  draft?: string | null;
  draftBackgroundDiscarded?: boolean;
  autoAnswered?: boolean;
  autoNote?: string;
}): HumanRelayItem {
  pruneHumanRelay();
  const item: HumanRelayItem = {
    id: randomUUID(),
    phone: input.phone.replace(/\D/g, ""),
    at: new Date().toISOString(),
    kind: input.kind,
    text: input.text.slice(0, 4000),
    heardLanguage: input.heardLanguage,
    draft: input.draft ?? null,
    draftBackgroundDiscarded: input.draftBackgroundDiscarded ?? false,
    answeredAt: input.autoAnswered ? new Date().toISOString() : null,
  };
  items.push(item);
  const forPhone = items.filter((i) => i.phone === item.phone);
  if (forPhone.length > MAX_PER_PHONE) {
    const drop = forPhone.find((i) => i.answeredAt) ?? forPhone[0];
    items.splice(items.indexOf(drop), 1);
  }
  while (items.length > MAX_ITEMS) items.shift();
  // Fire-and-forget dev-side email alert; the relay never waits on email.
  void sendRelayHeldAlert({ phone: item.phone, kind: item.kind, text: item.text, draft: item.draft, autoAnswered: Boolean(input.autoAnswered), autoNote: input.autoNote });
  return item;
}

export function pendingHumanRelay(): HumanRelayItem[] {
  pruneHumanRelay();
  return items.filter((i) => !i.answeredAt);
}

export function humanRelayBacklogSize(): number {
  pruneHumanRelay();
  return items.length;
}

/** Mark every held message for one number as answered. Returns how many. */
export function markHumanRelayAnswered(phone: string): number {
  const digits = phone.replace(/\D/g, "");
  let n = 0;
  for (const item of items) {
    if (!item.answeredAt && item.phone === digits) {
      item.answeredAt = new Date().toISOString();
      n++;
    }
  }
  return n;
}

export function lastHeardLanguageFor(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, "");
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].phone === digits && items[i].heardLanguage) return items[i].heardLanguage;
  }
  return undefined;
}

/** Bounded reply rate: one process, all relay replies share this window. */
export function admitHumanRelayReply(now = Date.now()): boolean {
  while (replyWindow.length && now - replyWindow[0] >= REPLY_WINDOW_MS) replyWindow.shift();
  if (replyWindow.length >= REPLY_MAX_PER_WINDOW) return false;
  replyWindow.push(now);
  return true;
}

function hmacHex(secret: string, value: string | Buffer): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqualHex(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reads need a signature made with the staging app secret over "read-relay", the same trust bar as the reply-sink readout. */
export function relayReadAuthorized(signature: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  return safeEqualHex(signature.slice(7), hmacHex(secret, "read-relay"));
}

/** Reply/skip calls sign the exact raw JSON body with the same secret. */
export function relayBodyAuthorized(signature: string | undefined, rawBody: Buffer | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=") || !rawBody?.length) return false;
  return safeEqualHex(signature.slice(7), hmacHex(secret, rawBody));
}

export function validateRelayReplyText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > HUMAN_RELAY_MAX_REPLY_CHARS) return null;
  return trimmed;
}

/** Test hook: clear all held items and the reply window. */
export function resetHumanRelay(): void {
  items.length = 0;
  replyWindow.length = 0;
}
