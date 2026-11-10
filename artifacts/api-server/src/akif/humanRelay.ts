import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
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

// Owner direction, 10 Nov one-voice launch: workers are the only conversation
// voice. Automatic greeting answers are off entirely; the env flag is inert.
export function relayAutoGreetingsEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}

// Owner-approved 10 Nov: acknowledgements (ok, thanks, noted) get a WhatsApp
// reaction instead of a text reply - and no typing bubble, no hold wait.
export function relayAckReactionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AKIF_RELAY_ACK_REACTIONS ?? "").trim() === "on";
}

// Owner-approved 10 Nov: when the brain actually used its tools for the
// answer, that answer may go straight out (staging allowlist only) instead of
// waiting on the human hold. Tool-less replies still hold.
// Owner direction, 10 Nov one-voice launch: no auto-bot answer may race a
// human worker. Tool-backed auto replies are off entirely; the env flag is inert.
export function relayAutoToolsEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}

const ACK_WORDS = /^(?:ok(?:ay|ey)?|okie?s?|k+|thanks?(?:\s+you)?(?:\s+so\s+much)?|thankyou|thx|ty|noted|got\s?it|cool|great|nice|super|fine|hmm+|hmm\s+ok|i\s+see|i\s+c\b|understood?|makes\s+sense|sounds\s+good|right|ah+(?:\s+ok(?:ay)?)?|oh+(?:\s+ok(?:ay)?)?|done|👍+|🙏+|❤️+|❤)[\s!.,]*$/i;

/** True only when the whole message is a bare acknowledgement. */
export function isAcknowledgementText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 30 && ACK_WORDS.test(t);
}

/** Owner style rule (10 Nov): no hyphens or dashes as sentence breaks in any
 *  bot/relay reply; commas or full stops read like a person texting. Only
 *  letter-to-letter breaks are rewritten, so ranges like "10 - 15 kg" stay. */
/** Non-relay parity flags (owner direction, 10 Nov): the brain front door for
 *  real users gets the relay's burst coalescing, ack reactions, busy wait,
 *  slow heads-up and voice answers. Each defaults OFF. */
export function brainBurstMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.AKIF_BRAIN_BURST_MS ?? 0) || 0;
}
export function brainAckReactionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AKIF_BRAIN_ACK_REACTIONS === "on";
}
export function brainBusyWaitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AKIF_BRAIN_BUSY_WAIT === "on";
}
export function brainSlowNudgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AKIF_BRAIN_SLOW_NUDGE === "on";
}
export function brainVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AKIF_BRAIN_VOICE === "on";
}

/** Dash sentence-breaks are never sent to customers (owner style rule, 10
 *  Nov). Shared by the relay reply cleaner and the main outbound cleaner. */
export function stripDashBreaks(text: string): string {
  return text
    // Spaced dash breaks ("word - word", "word — word") become a comma.
    .replace(/(?<=[A-Za-z0-9])\s+[-–—]\s+(?=[A-Za-z])/g, ", ")
    // Unspaced em/en dashes ("word—word") too. Plain hyphens inside words
    // (single-use, 6-digit) stay untouched.
    .replace(/(?<=[A-Za-z0-9])[–—]\s*(?=[A-Za-z])/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,([.!?])/g, "$1");
}

export function sanitizeRelayReplyText(text: string): string {
  return stripDashBreaks(text).replace(/\s{2,}/g, " ").trim();
}

const burstState = new Map<string, { seq: number; texts: string[] }>();

/** Rapid multi-bubble messages become ONE turn (owner feedback, 10 Nov): wait
 *  out the burst window; the newest bubble proceeds with all the texts and
 *  earlier bubbles resolve null. Shared by the relay hold and the brain front
 *  door. */
export async function collectBurst(phone: string, text: string, windowMs: number): Promise<string | null> {
  const burst = burstState.get(phone) ?? { seq: 0, texts: [] as string[] };
  burst.seq += 1;
  burst.texts.push(text);
  burstState.set(phone, burst);
  const mySeq = burst.seq;
  if (windowMs > 0) await new Promise((r) => setTimeout(r, windowMs));
  if (burstState.get(phone)?.seq !== mySeq) return null; // a newer bubble takes the turn
  burstState.delete(phone);
  return burst.texts.join("\n");
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
  "hi+", "hy+", "hello+", "helo+", "hey+", "hai+", "hii+", "yo",
  "good\\s+(?:morning|afternoon|evening|night)",
  "namaste", "namaskaram", "salaam?", "assalamu\\s+alaikum",
  "how\\s+(?:are|r)\\s+(?:you|u)", "how'?s\\s+it\\s+going", "what'?s\\s+up", "sup",
];
// A greeting may be addressed to the brand or the assistant ("hi UDC", "hello AKIF").
const SIMPLE_GREETING = new RegExp(
  `^\\s*(?:${GREETING_PARTS.join("|")})(?:[\\s,!.?…]+(?:(?:${GREETING_PARTS.join("|")})|udc|akif))*[\\s,!.?…]*$`,
  "i",
);

const FALLBACK_GREETINGS: Record<string, string[]> = {
  english: [
    "Hey, good to hear from you. What can I do for you?",
    "Hi there, how can I help you today?",
    "Hello, nice to hear from you. What are you looking for?",
  ],
  malayalam: [
    "\u0d39\u0d3e\u0d2f\u0d4d, \u0d38\u0d28\u0d4d\u0d24\u0d4b\u0d37\u0d02. \u0d0e\u0d28\u0d4d\u0d24\u0d3e\u0d23\u0d4d \u0d35\u0d47\u0d23\u0d4d\u0d1f\u0d24\u0d4d?",
    "\u0d39\u0d32\u0d4b, \u0d0e\u0d28\u0d4d\u0d24\u0d4d \u0d38\u0d39\u0d3e\u0d2f\u0d02 \u0d35\u0d47\u0d23\u0d02?",
  ],
};

const COMMISSION_ASK = /commission|commissions|\u0d15\u0d2e\u0d4d\u0d2e\u0d40\u0d37\u0d7b/i;

/** A commission question gets the fixed safe answer, never a role question
 *  or invented numbers (owner direction, 10 Nov launch). */
export function isCommissionAskText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 300 && COMMISSION_ASK.test(t);
}

export function commissionAskReply(language?: string | null): string {
  return language && /mal/i.test(language)
    ? "കമ്മീഷൻ deal ഓരോന്നിലും തീരുന്നത്. Deal close ആകുമ്പോൾ exact terms ഞങ്ങളുടെ team നിങ്ങളോട് നേരിട്ട് confirm ചെയ്യും. അതൊന്നും യാന്ത്രികമായി കിട്ടില്ല."
    : "Commission is decided deal by deal. When a deal closes through UDC, our team confirms the exact terms with you directly. Nothing is fixed in advance or paid automatically.";
}

/** A warm hello that needs no model: for greeting auto-answers while the
 *  brain is rate-limited or down. Variants rotate so repeats don't read as
 *  a canned line. Malayalam when the customer's last heard language is Malayalam. */
export function fallbackGreeting(language?: string | null): string {
  const key = language && /mal/i.test(language) ? "malayalam" : "english";
  const list = FALLBACK_GREETINGS[key];
  return list[Math.floor(Date.now() / 1000) % list.length];
}

/** True only when the whole message is greeting words - nothing else. */
export function isSimpleGreetingText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 60 && SIMPLE_GREETING.test(t);
}

const MENU_REQUEST = /^(?:(?:open|show|show me|show me the|send|send me)\s+)?(?:udc\s+)?menu[.!?]*$/i;

/** Typed menu request - mirrors the scripted typed-action rule in chatUi. */
export function isMenuRequestText(text: string): boolean {
  return MENU_REQUEST.test(text.trim());
}

/** Menu explanations may say the word "menu" (the brain enforces menu-once);
 *  links, emails and long numbers stay blocked. */
export function menuAutoReplySafe(draft: string | null | undefined): draft is string {
  if (!draft) return false;
  const t = draft.trim();
  if (t.length === 0 || t.length > 600) return false;
  if (/https?:\/\/|www\.|\S+@\S+|\d{5,}/i.test(t)) return false;
  return true;
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
  autoAnswered?: boolean;
  autoNote?: string;
  claimedBy?: string | null;
  claimedAt?: string | null;
  // Registered account state at hold time (role, status, invite code) so a
  // human answering never asks what the system already knows.
  customerNote?: string;
  // Read-side only (claim/pending payloads): the number's recent held
  // history, so an answer builds on earlier turns instead of re-asking.
  context?: HumanRelayContextItem[];
  // Read-side only (claim payload): every held item this claim covers. One
  // claim is one customer turn - all of the contact's unanswered messages.
  claimedItemIds?: string[];
  // Read-side only (claim payload): the bot's most recent lines to this
  // contact, so the worker continues the thread instead of restarting it.
  recentReplies?: string[];
  // Read-side only (claim/pending payloads): the full thread for this
  // contact, oldest first, customer and bot lines interleaved (owner
  // direction, 10 Nov: read the whole conversation before replying).
  thread?: HumanRelayThreadItem[];
  // Read-side only: the owner's reply style note for whoever answers.
  replyStyle?: string;
  // Read-side only: relay-owner briefing about this contact for the workers.
  workerBriefing?: string;
};

export type HumanRelayContextItem = {
  at: string;
  kind: "text" | "voice";
  text: string;
  answered: boolean;
};

export type HumanRelayThreadItem = {
  at: string;
  from: "customer" | "akif";
  text: string;
};

const items: HumanRelayItem[] = [];
const replyWindow: number[] = [];
// Insertion order for thread building: wall-clock timestamps often tie at
// millisecond precision, so each held message and each sent line also gets
// a sequence number.
let relaySeq = 0;
const itemSeqById = new Map<string, number>();

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

/** "all" (or "*") holds every number's open chat turns (relay-for-everyone mode). */
/** Email-channel contacts ride the same queue keyed as "email:<address>"
 *  (Phase A, synthetic only): no digit stripping, no schema change - the key
 *  round-trips through the existing phone column. */
export const EMAIL_RELAY_PREFIX = "email:";
export function isEmailRelayContact(contact: string): boolean {
  return contact.startsWith(EMAIL_RELAY_PREFIX) && canonicalRelayEmail(contact.slice(EMAIL_RELAY_PREFIX.length)) !== null;
}
function canonicalRelayEmail(address: string): string | null {
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(address) && !address.includes("..") ? address.toLowerCase() : null;
}
/** One key for one customer: digits for WhatsApp, "email:<address>" for email. */
export function relayContactKey(phone: string): string {
  return isEmailRelayContact(phone) ? EMAIL_RELAY_PREFIX + canonicalRelayEmail(phone.slice(EMAIL_RELAY_PREFIX.length)) : phone.replace(/\D/g, "");
}
/** Phase A gate for the email channel: staging synthetic pilot only, and only
 *  while the reply sink is in store mode so no real send can happen. Mirrors
 *  syntheticEmailRelayEnabled in channels/emailRelayChannel.ts (kept separate
 *  to avoid a module cycle). */
export function emailRelaySyntheticEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.UDC_APP_ENV === "staging" && env.UDC_EMAIL_PILOT_MODE === "synthetic" && env.AKIF_WHATSAPP_REPLY_SINK === "store";
}

export function humanRelayActiveFor(phone: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!humanRelayEnabled(env)) return false;
  if (isEmailRelayContact(phone)) return emailRelaySyntheticEnabled(env);
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return false;
  const raw = (env.AKIF_HUMAN_RELAY_NUMBERS ?? "").split(",").map((s) => s.trim().toLowerCase());
  if (raw.includes("all") || raw.includes("*")) return true;
  return humanRelayNumbers(env).includes(digits);
}

/** Brain fallback for a held relay item: after this many ms without a dev
 *  answer, a draft that already passes the auto-send gates is sent as the
 *  brain's answer (owner direction, 10 Nov). Default 0 = off. */
export function relayFallbackMs(_env: NodeJS.ProcessEnv = process.env): number {
  // Owner direction, 10 Nov one-voice launch: the fallback timer auto-sent a
  // draft when no dev answered in time, racing the workers. Off entirely.
  return 0;
}

/** "all" emails every held item (default); "holds" emails only items still
 *  waiting on a dev answer (cuts alert volume once auto-answers are trusted). */
export function relayAlertMode(env: NodeJS.ProcessEnv = process.env): "all" | "holds" {
  return (env.AKIF_RELAY_ALERT_MODE ?? "all").trim().toLowerCase() === "holds" ? "holds" : "all";
}

/** The auto-send gates, together: greeting-safe, menu-safe or tool-backed. */
export function relayFallbackReplySafe(text: string, reply: string | null | undefined, toolsUsed: string[]): reply is string {
  return (isSimpleGreetingText(text) && greetingAutoReplySafe(reply))
    || (isMenuRequestText(text) && menuAutoReplySafe(reply))
    || relayAutoToolReplySafe(reply, toolsUsed);
}

/** Sends the held draft after windowMs if no dev answered first. The safety
 *  gates are evaluated by the caller before scheduling; the timer is lost on
 *  restart (held items are memory-only by design). */
export function scheduleRelayFallback(item: HumanRelayItem, deliver: (phone: string, reply: string) => Promise<{ delivered?: boolean } | null | undefined>, windowMs = relayFallbackMs()): void {
  if (windowMs <= 0 || item.answeredAt || !item.draft) return;
  const timer = setTimeout(() => {
    const still = items.find((i) => i.id === item.id && !i.answeredAt);
    if (!still || !still.draft) return;
    void deliver(still.phone, still.draft).then((sent) => {
      if (sent?.delivered) {
        still.answeredAt = new Date().toISOString();
        persist((p) => p.markAnswered([still.id], still.answeredAt!));
        console.info("AKIF relay fallback auto-sent a held draft", { kind: still.kind });
      }
    }).catch(() => { /* the item stays held for the dev side */ });
  }, windowMs);
  timer.unref?.();
}

export function pruneHumanRelay(now = Date.now()): void {
  let pruned = 0;
  while (items.length && now - Date.parse(items[0].at) > ITEM_TTL_MS) { items.shift(); pruned += 1; }
  if (pruned) persist((p) => p.deleteOlderThan(ITEM_TTL_MS));
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
  customerNote?: string;
}): HumanRelayItem {
  pruneHumanRelay();
  const item: HumanRelayItem = {
    id: randomUUID(),
    phone: relayContactKey(input.phone),
    at: new Date().toISOString(),
    kind: input.kind,
    text: input.text.slice(0, 4000),
    heardLanguage: input.heardLanguage,
    draft: input.draft ?? null,
    draftBackgroundDiscarded: input.draftBackgroundDiscarded ?? false,
    answeredAt: input.autoAnswered ? new Date().toISOString() : null,
    autoAnswered: input.autoAnswered || undefined,
    autoNote: input.autoNote,
    customerNote: input.customerNote,
  };
  itemSeqById.set(item.id, relaySeq++);
  items.push(item);
  const dropped: string[] = [];
  const forPhone = items.filter((i) => i.phone === item.phone);
  if (forPhone.length > MAX_PER_PHONE) {
    const drop = forPhone.find((i) => i.answeredAt) ?? forPhone[0];
    items.splice(items.indexOf(drop), 1);
    dropped.push(drop.id);
  }
  while (items.length > MAX_ITEMS) dropped.push(items.shift()!.id);
  persist((p) => p.upsertItem(item));
  if (dropped.length) persist((p) => p.deleteItems(dropped));
  // No per-message alert email (owner direction, 10 Nov): the free email
  // quota is for OTP/auth mail only. Workers poll the claim endpoint, so a
  // held message never depends on email to get answered.
  return item;
}

/** Worker style note (owner direction, 10 Nov): attached to every claim and
 *  pending payload so every reply worker writes like a warm, relaxed person
 *  texting. Mechanics stay in code; this only shapes the voice. */
export const RELAY_REPLY_STYLE_NOTE =
  "Sound like a warm, relaxed person texting: short, friendly, natural, a little casual. " +
  "Never stiff or formal, never robotic, never the same phrasing twice, no stock phrases. Answer first, one thing at a time. " +
  "Never ask what the thread or the customer note already knows; state known facts instead. " +
  "Never mention AI models, drafts, staging or internal systems. " +
  "No dash symbols anywhere; break sentences with a comma or full stop. " +
  "Read the whole thread first (thread shows every message from first to last), then continue from its last topic like a real person: never restart with a generic greeting or opener, and never repeat a line already used in this chat (recentReplies shows what was already said). " +
  "If they sent several messages, answer each one as its own bubble from you, one reply per message. " +
  "If they share grief or ask to pause business: one short warm reply about what they said, at most one gentle question, never Menu, never sales talk. " +
  "When they need to send KYC, ID or bank documents, issue the secure single-use link with the doclink tool; never collect documents over chat.";

/** Per-contact briefing from the relay owner to the reply workers (10 Nov:
 *  e.g. "no email needed for this customer, do not promise one"). Kept in
 *  memory only - briefings are ephemeral instructions, not customer data, and
 *  a redeploy simply clears them. Shown at READ time on pending and claim
 *  payloads, so it reaches a worker even for an item already held. */
const contactBriefings = new Map<string, string>();

export function setRelayContactBriefing(phone: string, text: string): void {
  const key = relayContactKey(phone);
  const clean = text.trim().slice(0, 500);
  if (clean) contactBriefings.set(key, clean);
  else contactBriefings.delete(key);
}

export function relayBriefingForContact(phone: string): string | undefined {
  return contactBriefings.get(relayContactKey(phone));
}

export function pendingHumanRelay(): HumanRelayItem[] {
  pruneHumanRelay();
  return items.filter((i) => !i.answeredAt)
    .map((i) => ({ ...i, context: recentHumanRelayContext(i.phone, i.id), thread: relayThreadFor(i.phone), replyStyle: RELAY_REPLY_STYLE_NOTE, workerBriefing: relayBriefingForContact(i.phone) }));
}

/** Recent held history for one number, oldest first: what the customer
 *  already said and which of it was answered. Attached to claim and pending
 *  payloads so whoever answers builds on earlier turns - never re-asks for a
 *  detail already given, never repeats a question just answered. */
export function recentHumanRelayContext(phone: string, excludeId?: string, max = 60): HumanRelayContextItem[] {
  const digits = relayContactKey(phone);
  return items
    .filter((i) => i.phone === digits && i.id !== excludeId)
    .slice(-max)
    .map((i) => ({ at: i.at, kind: i.kind, text: i.text, answered: Boolean(i.answeredAt) }));
}

/** The full thread for one number, oldest first: customer lines and bot
 *  replies interleaved. Attached to every claim and pending payload so the
 *  worker reads the whole conversation before writing (owner, 10 Nov). */
export function relayThreadFor(phone: string): HumanRelayThreadItem[] {
  const digits = relayContactKey(phone);
  const events: Array<HumanRelayThreadItem & { seq: number }> = [];
  for (const i of items.filter((i) => i.phone === digits)) {
    events.push({ at: i.at, from: "customer", text: i.text, seq: itemSeqById.get(i.id) ?? 0 });
  }
  for (const r of recentRepliesByPhone.get(digits) ?? []) {
    events.push({ at: new Date(r.at).toISOString(), from: "akif", text: r.text, seq: r.seq ?? 0 });
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq);
  return events.map(({ at, from, text }) => ({ at, from, text }));
}

/** Facts the customer already gave in this thread (owner feedback, 10 Nov:
 *  "the bot has no memory"). Parsed conservatively from held turns and the
 *  latest customer note; anything uncertain stays undefined and may be asked.
 */
export type RelayKnownFacts = { email?: string; name?: string; company?: string; role?: string };

export function knownFactsForContact(phone: string): RelayKnownFacts {
  const digits = relayContactKey(phone);
  const facts: RelayKnownFacts = {};
  for (const item of items.filter((i) => i.phone === digits)) {
    const t = item.text;
    if (!facts.email) {
      const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(t);
      if (m) facts.email = m[0];
    }
    if (!facts.name) {
      const m = /(?:my (?:full )?name is[:\s]+|full name[:\s]+)([A-Za-z][A-Za-z .'-]{1,60})/i.exec(t);
      if (m) facts.name = m[1].trim().replace(/[.!,]+$/, "");
    }
    if (!facts.company) {
      const m = /(?:my company(?: name)? is[:\s]+|company name[:\s]+)([A-Za-z0-9][A-Za-z0-9 &.,'()-]{1,80})/i.exec(t);
      if (m) facts.company = m[1].trim().replace(/[.!,]+$/, "");
    }
    if (!facts.role) {
      const m = /^(agent|buyer|seller)(?: only)?[.!\s]*$/i.exec(t.trim());
      if (m) facts.role = m[1].toLowerCase();
    }
    const note = item.customerNote ?? "";
    if (!facts.role) {
      const m = /registered (agent|buyer|seller)/.exec(note);
      if (m) facts.role = m[1];
    }
    if (!facts.email) {
      const m = /email already given: (\S+)/.exec(note);
      if (m) facts.email = m[1];
    }
  }
  return facts;
}

/** Guard (owner direction, 10 Nov): a reply must never ask for something the
 *  customer already answered. Returns the known detail it re-asks, or null.
 *  Confirmation questions count as asking; state the fact instead. */
export function replyAsksKnownDetail(reply: string, facts: RelayKnownFacts): string | null {
  const asks = reply.includes("?") || /\b(?:tell me|share|send me|give me|may i have|can i have)\b/i.test(reply);
  if (!asks) return null;
  if (facts.email && /\be-?mails?\b|email id|mail id/i.test(reply)) return "email";
  if (facts.name && /\b(?:full name|your name)\b/i.test(reply)) return "full name";
  if (facts.company && /\bcompany(?: name)?\b/i.test(reply)) return "company name";
  if (facts.role && /\b(?:buyer|seller|agent)\b/i.test(reply) && /\b(?:register|joining|join|which one|role|as a)\b/i.test(reply)) return "role";
  return null;
}

/** An email address the customer already sent in a held message, if any.
 *  Folded into the customer note so registration never asks twice. */
export function emailGivenInRelay(phone: string): string | undefined {
  for (const turn of recentHumanRelayContext(phone).reverse()) {
    const found = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(turn.text);
    if (found) return found[0];
  }
  return undefined;
}

export function humanRelayBacklogSize(): number {
  pruneHumanRelay();
  return items.length;
}

// Parallel relay workers (owner direction, 10 Nov): a pool of reply workers
// claims held items one at a time. A claim is exclusive for CLAIM_TTL_MS and
// per-number ordered: a phone's next item cannot be claimed while an older
// item for that phone is unanswered or actively claimed.
// 90s (owner direction, 10 Nov): a worker that dies mid-claim must never
// strand a customer. Late answers from a lost claim hit the answered item or
// the per-contact reply window, so a premature release cannot double-send.
const CLAIM_TTL_MS = 90_000;

export function claimHumanRelay(workerId: string): HumanRelayItem | null {
  pruneHumanRelay();
  const now = Date.now();
  const activeClaim = (i: HumanRelayItem) => Boolean(i.claimedBy && i.claimedAt && now - Date.parse(i.claimedAt) < CLAIM_TTL_MS);
  for (const item of items) {
    if (item.answeredAt || item.autoAnswered) continue;
    if (activeClaim(item)) continue;
    const sticky = stickyWorkerFor(item.phone, now);
    if (sticky && sticky !== workerId) continue;
    const blocked = items.some((i) => i !== item && i.phone === item.phone && !i.answeredAt && !i.autoAnswered
      && (Date.parse(i.at) < Date.parse(item.at) || activeClaim(i)));
    if (blocked) continue;
    item.claimedBy = workerId;
    const claimedAt = new Date(now).toISOString();
    item.claimedAt = claimedAt;
    // One voice per customer turn (owner direction, 10 Nov): every other
    // unanswered message for this phone joins the same claim, so one worker
    // sees the whole turn and no second worker can answer part of it.
    const bundle: HumanRelayItem[] = [];
    for (const other of items) {
      if (other === item || other.phone !== item.phone || other.answeredAt || other.autoAnswered) continue;
      if (activeClaim(other)) continue;
      other.claimedBy = workerId;
      other.claimedAt = claimedAt;
      bundle.push(other);
      persist((p) => p.setClaim(other.id, workerId, claimedAt));
    }
    persist((p) => p.setClaim(item.id, workerId, claimedAt));
    return { ...item, claimedItemIds: [item.id, ...bundle.map((b) => b.id)], context: recentHumanRelayContext(item.phone, item.id), thread: relayThreadFor(item.phone), recentReplies: recentRelayRepliesFor(item.phone), replyStyle: RELAY_REPLY_STYLE_NOTE, workerBriefing: relayBriefingForContact(item.phone) };
  }
  return null;
}

/** Answer one claimed item. Enforces claim ownership so two workers can
 *  never answer the same message. Returns the item, or null when the claim
 *  is missing, expired, owned by another worker, or already answered. */
export function answerClaimedHumanRelayItem(itemId: string, workerId: string, replyText?: string): HumanRelayItem | null {
  const item = items.find((i) => i.id === itemId);
  if (!item || item.answeredAt) return null;
  if (item.claimedBy !== workerId) return null;
  // One reply per customer message (owner direction, 10 Nov): each message in
  // the bundle gets its own bubble from the same worker, so only this item
  // closes; the rest of the claimed turn stays with this worker.
  item.answeredAt = new Date().toISOString();
  persist((p) => p.markAnswered([item.id], item.answeredAt!, replyText));
  noteHumanRelayReplySent(item.phone, workerId, replyText);
  return item;
}

/** Pre-send validation (10 Nov): the route must check this BEFORE delivering.
 *  Sending first and checking after let a stale claim's message go out. */
export function relayClaimStillValid(itemId: string, workerId: string): boolean {
  const item = items.find((i) => i.id === itemId);
  if (!item || item.answeredAt || item.autoAnswered) return false;
  if (item.claimedBy !== workerId || !item.claimedAt) return false;
  return Date.now() - Date.parse(item.claimedAt) < CLAIM_TTL_MS;
}

/** Mark every held message for one number as answered. Returns how many. */
/** True when an open item for this phone is under an active worker claim.
 *  Phone-only relay replies must not race that worker (double-reply bug,
 *  10 Nov launch). */
export function hasActiveHumanRelayClaim(phone: string): boolean {
  pruneHumanRelay();
  const now = Date.now();
  const digits = relayContactKey(phone);
  return items.some((i) => i.phone === digits && !i.answeredAt && !i.autoAnswered
    && Boolean(i.claimedBy && i.claimedAt && now - Date.parse(i.claimedAt) < CLAIM_TTL_MS));
}

export function markHumanRelayAnswered(phone: string, replyText?: string): number {
  const digits = relayContactKey(phone);
  const at = new Date().toISOString();
  let n = 0;
  for (const item of items) {
    if (!item.answeredAt && item.phone === digits) {
      item.answeredAt = at;
      n++;
    }
  }
  if (n) persist((p) => p.markPhoneAnswered(digits, at, replyText));
  return n;
}

export function lastHeardLanguageFor(phone: string): string | undefined {
  const digits = relayContactKey(phone);
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].phone === digits && items[i].heardLanguage) return items[i].heardLanguage;
  }
  return undefined;
}

/** One voice per contact (owner direction, 10 Nov): after a reply goes out
 *  for a phone, a second send to the same phone is refused for this long.
 *  In-memory by design; a restart simply clears the window. */
const REPLY_COOLDOWN_MS = 20_000;
const lastReplyAtByPhone = new Map<string, number>();
const lastReplyByByPhone = new Map<string, string>();
// Sticky ownership (owner direction, 10 Nov): once a worker answers a
// customer, that worker keeps the customer until they go idle - one human
// owns one conversation, so chats run in parallel without mixing.
const STICKY_WORKER_MS = 10 * 60 * 1000;

/** The worker who currently owns this customer, when their last reply is
 *  recent. Undefined once they have been idle past the window. */
export function stickyWorkerFor(phone: string, now = Date.now()): string | undefined {
  const key = relayContactKey(phone);
  const by = lastReplyByByPhone.get(key);
  const at = lastReplyAtByPhone.get(key);
  if (!by || at === undefined || now - at >= STICKY_WORKER_MS) return undefined;
  return by;
}
// Recent bot lines per phone, so workers see what the chat already said and
// the guard can block repeats and conversation resets (owner direction, 10 Nov).
const recentRepliesByPhone = new Map<string, Array<{ at: number; text: string; seq?: number }>>();
const RECENT_REPLIES_KEPT = 60;

/** The last bot lines for a phone, oldest first. Shown on claim payloads. */
export function recentRelayRepliesFor(phone: string): string[] {
  return (recentRepliesByPhone.get(relayContactKey(phone)) ?? []).map((r) => r.text);
}

const normReplyLine = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/gi, "").replace(/\s+/g, " ").trim();
const GENERIC_RESET = /good to hear from you|what can i help you with|how (?:can|may) i help|welcome back|nice to hear from you/i;
const GREETING_ONLY = /^(?:hey|hi+|hello+|namaste|good (?:morning|afternoon|evening)|dear)[\s!.,]*$/i;

const REPLY_STOPWORDS = new Set(("a an the and or but so to of in on for with is are was were be been it its this that these those i you we they he she " +
  "your my our their me him her us them do does did have has had will would can could should not no yes just only also very really much more most some any").split(" "));

const stem = (w: string): string => w.replace(/(?:es|s)$/, "");
const contentWords = (s: string): Set<string> => new Set(normReplyLine(s).split(" ").filter((w) => w.length > 2 && !REPLY_STOPWORDS.has(w)).map(stem));

/** True when a reply repeats a recent bot line or resets the conversation
 *  with a generic opener although the thread already has bot replies. Also
 *  true when it mostly restates a recent answer's content in new words
 *  (owner direction, 10 Nov: "I see" must never get the same answer again). */
export function relayReplyResetsConversation(phone: string, text: string): boolean {
  const recent = recentRepliesByPhone.get(relayContactKey(phone)) ?? [];
  if (!recent.length) return false;
  const t = normReplyLine(text);
  if (t && recent.some((r) => normReplyLine(r.text) === t)) return true;
  if (GENERIC_RESET.test(text) || GREETING_ONLY.test(text.trim())) return true;
  const words = contentWords(text);
  if (words.size >= 4) {
    // Compare against the union of the last few bot lines: a restatement
    // typically draws pieces from more than one of them.
    const prev = new Set<string>();
    for (const r of recent.slice(-6)) for (const w of contentWords(r.text)) prev.add(w);
    if (prev.size) {
      let shared = 0;
      for (const w of words) if (prev.has(w)) shared++;
      const fresh = words.size - shared;
      if (shared / words.size >= 0.65 && fresh <= 3) return true;
    }
  }
  return false;
}

/** One worker, one customer at a time (owner direction, 10 Nov): a second
 *  sender is refused inside the window, but the worker who just answered may
 *  send follow-up bubbles to the same customer (multi-bubble is fine).
 *  Phone-only sends (no itemId) hold other workers for the whole claim
 *  window: late duplicates from a second worker landed after the short
 *  window and read as two people answering. */
export function relayReplyCooldownActive(phone: string, workerId?: string, now = Date.now(), phoneOnly = false): boolean {
  const key = relayContactKey(phone);
  const at = lastReplyAtByPhone.get(key);
  const windowMs = phoneOnly ? CLAIM_TTL_MS : REPLY_COOLDOWN_MS;
  if (at === undefined || now - at >= windowMs) return false;
  const by = lastReplyByByPhone.get(key);
  if (workerId && by && workerId === by) return false;
  return true;
}

export function noteHumanRelayReplySent(phone: string, workerId?: string, text?: string, now = Date.now()): void {
  const key = relayContactKey(phone);
  lastReplyAtByPhone.set(key, now);
  if (workerId) lastReplyByByPhone.set(key, workerId);
  if (text) {
    const list = recentRepliesByPhone.get(key) ?? [];
    list.push({ at: now, text, seq: relaySeq++ });
    while (list.length > RECENT_REPLIES_KEPT) list.shift();
    recentRepliesByPhone.set(key, list);
  }
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

/** Test hook: clear only the in-memory queue (simulates a process restart). */
export function __clearRelayMemoryForTests(): void {
  items.length = 0;
  replyWindow.length = 0;
  burstState.clear();
  recentRepliesByPhone.clear();
  lastReplyAtByPhone.clear();
  lastReplyByByPhone.clear();
  itemSeqById.clear();
  relaySeq = 0;
}

/** Test hook: clear all held items and the reply window. */
export function resetHumanRelay(): void {
  __clearRelayMemoryForTests();
  contactBriefings.clear();
  persist((p) => p.deleteAll());
}

// Durable queue (owner-approved migration 20261110_akif_human_relay_items, 10
// Nov): every mutation above also writes through to the DB, and a fresh boot
// hydrates open items from it, so a deploy or restart no longer drops held
// customer messages (two were lost on the #509 deploy). The in-memory array
// stays the single-instance hot path; the DB module is imported lazily so
// tests keep running without a database.
type RelayRow = {
  id: string; phone: string; at: Date | string; kind: string; text: string;
  heard_language: string | null; draft: string | null; draft_background_discarded: boolean;
  answered_at: Date | string | null; auto_answered: boolean; auto_note: string | null;
  claimed_by: string | null; claimed_at: Date | string | null; customer_note: string | null;
};

function relayRowToItem(r: RelayRow): HumanRelayItem {
  return {
    id: r.id,
    phone: r.phone,
    at: new Date(r.at).toISOString(),
    kind: r.kind === "voice" ? "voice" : "text",
    text: r.text,
    heardLanguage: r.heard_language ?? undefined,
    draft: r.draft,
    draftBackgroundDiscarded: Boolean(r.draft_background_discarded),
    answeredAt: r.answered_at ? new Date(r.answered_at).toISOString() : null,
    autoAnswered: r.auto_answered || undefined,
    autoNote: r.auto_note ?? undefined,
    claimedBy: r.claimed_by,
    claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
    customerNote: r.customer_note ?? undefined,
  };
}

export interface RelayPersistence {
  upsertItem(item: HumanRelayItem): Promise<void>;
  markAnswered(ids: string[], at: string, replyText?: string): Promise<void>;
  markPhoneAnswered(phone: string, at: string, replyText?: string): Promise<void>;
  setClaim(id: string, workerId: string, at: string): Promise<void>;
  deleteItems(ids: string[]): Promise<void>;
  deleteOlderThan(ttlMs: number): Promise<void>;
  deleteAll(): Promise<void>;
  fetchOpen(maxItems: number, ttlMs: number): Promise<HumanRelayItem[]>;
  fetchRecent(maxItems: number, ttlMs: number): Promise<HumanRelayItem[]>;
}

type RelayDb = { execute: (query: unknown) => Promise<{ rows?: RelayRow[] }> };

async function defaultRelayPersistence(): Promise<RelayPersistence | null> {
  try {
    const mod = (await import("@workspace/db")) as { db?: RelayDb };
    const db = mod.db;
    if (!db) return null;
    const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);
    return {
      async upsertItem(i) {
        await db.execute(sql`INSERT INTO akif_human_relay_items
          (id, phone, at, kind, text, heard_language, draft, draft_background_discarded, answered_at, auto_answered, auto_note, claimed_by, claimed_at, customer_note)
          VALUES (${i.id}, ${i.phone}, ${i.at}, ${i.kind}, ${i.text}, ${i.heardLanguage ?? null}, ${i.draft}, ${i.draftBackgroundDiscarded}, ${i.answeredAt}, ${Boolean(i.autoAnswered)}, ${i.autoNote ?? null}, ${i.claimedBy ?? null}, ${i.claimedAt ?? null}, ${i.customerNote ?? null})
          ON CONFLICT (id) DO NOTHING`);
      },
      async markAnswered(ids, at, replyText) {
        if (!ids.length) return;
        if (replyText !== undefined) {
          await db.execute(sql`UPDATE akif_human_relay_items SET answered_at = ${at}, draft = ${replyText} WHERE id IN (${idList(ids)})`);
          return;
        }
        await db.execute(sql`UPDATE akif_human_relay_items SET answered_at = ${at} WHERE answered_at IS NULL AND id IN (${idList(ids)})`);
      },
      async markPhoneAnswered(phone, at, replyText) {
        await db.execute(sql`UPDATE akif_human_relay_items SET answered_at = ${at} WHERE phone = ${phone} AND answered_at IS NULL`);
        if (replyText !== undefined) {
          await db.execute(sql`UPDATE akif_human_relay_items SET draft = ${replyText} WHERE id = (SELECT id FROM akif_human_relay_items WHERE phone = ${phone} AND answered_at IS NOT NULL ORDER BY at DESC LIMIT 1)`);
        }
      },
      async setClaim(id, workerId, at) {
        await db.execute(sql`UPDATE akif_human_relay_items SET claimed_by = ${workerId}, claimed_at = ${at} WHERE id = ${id}`);
      },
      async deleteItems(ids) {
        if (!ids.length) return;
        await db.execute(sql`DELETE FROM akif_human_relay_items WHERE id IN (${idList(ids)})`);
      },
      async deleteOlderThan(ttlMs) {
        await db.execute(sql`DELETE FROM akif_human_relay_items WHERE at < now() - make_interval(secs => ${Math.floor(ttlMs / 1000)})`);
      },
      async deleteAll() {
        await db.execute(sql`DELETE FROM akif_human_relay_items`);
      },
      async fetchOpen(maxItems, ttlMs) {
        const r = await db.execute(sql`SELECT * FROM akif_human_relay_items WHERE answered_at IS NULL AND at > now() - make_interval(secs => ${Math.floor(ttlMs / 1000)}) ORDER BY at ASC LIMIT ${maxItems}`);
        return (r.rows ?? []).map(relayRowToItem);
      },
      async fetchRecent(maxItems, ttlMs) {
        const r = await db.execute(sql`SELECT * FROM akif_human_relay_items WHERE at > now() - make_interval(secs => ${Math.floor(ttlMs / 1000)}) ORDER BY at ASC LIMIT ${maxItems}`);
        return (r.rows ?? []).map(relayRowToItem);
      },
    };
  } catch {
    return null;
  }
}

let persistencePromise: Promise<RelayPersistence | null> | null = null;
function relayPersistence(): Promise<RelayPersistence | null> {
  if (!persistencePromise) persistencePromise = defaultRelayPersistence().catch(() => null);
  return persistencePromise;
}

/** Test hook: swap DB persistence for a fake (or null to disable). */
export function __setRelayPersistenceForTests(fake: RelayPersistence | null): void {
  persistencePromise = Promise.resolve(fake);
}

function persist(run: (p: RelayPersistence) => Promise<void>): void {
  void relayPersistence()
    .then((p) => (p ? run(p) : undefined))
    .catch((error) => console.warn("AKIF relay persistence write failed", { reason: error instanceof Error ? error.name : "unknown" }));
}

/** Restore still-open held items from the DB after a restart. Returns how
 *  many were restored; 0 when there is no DB or nothing open. */
export async function hydrateHumanRelay(): Promise<number> {
  const p = await relayPersistence();
  if (!p) return 0;
  try {
    const recent = await p.fetchRecent(MAX_ITEMS, ITEM_TTL_MS);
    let added = 0;
    for (const row of recent) {
      if (!items.some((i) => i.id === row.id)) { items.push(row); added += 1; }
      // Rebuild the bot-line memory from the reply stored on each answered
      // row, so the repeat guard and the thread survive a restart.
      if (!itemSeqById.has(row.id)) itemSeqById.set(row.id, relaySeq++);
      if (row.answeredAt && row.draft) {
        const key = relayContactKey(row.phone);
        const list = recentRepliesByPhone.get(key) ?? [];
        if (!list.some((r) => r.text === row.draft)) {
          list.push({ at: Date.parse(row.answeredAt), text: row.draft, seq: relaySeq++ });
          list.sort((a, b) => a.at - b.at);
          while (list.length > RECENT_REPLIES_KEPT) list.shift();
          recentRepliesByPhone.set(key, list);
        }
      }
    }
    items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const open = recent.filter((r) => !r.answeredAt).length;
    if (added > 0) console.info("AKIF relay queue restored after restart", { items: added, open });
    return recent.filter((r) => !r.answeredAt).length;
  } catch {
    return 0;
  }
}
