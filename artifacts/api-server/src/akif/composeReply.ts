import { runConversationChat } from "./intelligence/hermesClient";
import { isSafeConversationText } from "./dealDecisionSafety";
import { claimsUnverifiedFact } from "./conversationPolicy";
import { checkReplyQuality } from "./answerScoring";
import { EMOTION_REFERENCE } from "./emotionNotes";

// Dash sentence-breaks are never sent to customers (owner style rule, 10 Nov).
// Kept local so test fixtures that stub ./humanRelay never affect this module;
// the regexes mirror humanRelay.stripDashBreaks exactly.
function stripDashBreaks(text: string): string {
  return text
    .replace(/(?<=[A-Za-z0-9])\s+[-–—]\s+(?=[A-Za-z])/g, ", ")
    .replace(/(?<=[A-Za-z0-9])[–—]\s*(?=[A-Za-z])/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,([.!?])/g, "$1");
}

// AI wording for the post-handshake account flows (owner rule, 14 Nov): after
// the T&C handshake, every customer-facing line is Akif speaking in its own
// words. The deterministic security core (code generation, exact code check,
// eligibility rules, hold gate) never goes through the model. This helper only
// composes the WORDS around an already-decided deterministic outcome.
//
// Voice source of truth: the repo's own notes - orchestratorSystem's
// boundaries in brainOrchestrator.ts, the persona line in
// profileIntakeConversation.ts, and EMOTION_REFERENCE in emotionNotes.ts
// (owner's architecture document, 29 Oct), plus the research notes in
// docs/akif-brain-research-notes.md section 5 (empathy style: condolence
// first, then one small practical step; never a cold "Okay.").
//
// Reliability: if every provider is down or the reply fails a guard, the
// caller's fixed line is sent instead and the fallback is logged. That is an
// outage safety net, not the normal path.

export type ComposeSpec = {
  // What this one message must accomplish, as an instruction to Akif.
  intent: string;
  // Exact strings that must survive verbatim (commands, keywords). The
  // composed text is rejected if any is missing.
  mustSay?: string[];
  // Extra hard constraints appended to the prompt.
  neverDo?: string[];
  // The customer's last message: the reply matches its language.
  languageOf?: string;
  maxChars?: number;
};

const COMPOSE_TIMEOUT_MS = 12_000;

export async function composeAkifWording(spec: ComposeSpec): Promise<string | null> {
  const maxChars = spec.maxChars ?? 700;
  try {
    const { content } = await runConversationChat(
      JSON.stringify({
        task: spec.intent,
        mustKeepExact: spec.mustSay ?? [],
        neverDo: spec.neverDo ?? [],
      }),
      [
        "You are Akif, UpDownCircle's AI trade coordinator on WhatsApp.",
        "Write ONE short WhatsApp message in your own natural words that does exactly what the task says.",
        "Reply like a capable broker or coordinator would text: concise, warm, context-aware and direct. One short message; two short sentences only when needed.",
        "Deeply human posture: if the customer might be frustrated or confused, acknowledge the feeling first in plain warm words, then give the next step. Never cold or robotic.",
        EMOTION_REFERENCE,
        "Never claim to be human: you are UDC's AI assistant.",
        "No markdown, no menus, no numbered or bulleted lists, no labels, no decorative punctuation, no canned stock lines.",
        "Never use hyphens or dashes as sentence breaks; write like a person texting, with commas or full stops. Plain hyphens inside words like single-use or 6-digit are fine.",
        "Never invent facts, links, codes, reference numbers, dates or outcomes. State only what the task states.",
        "Never claim or hint that an account is verified, approved, registered or complete, and never claim an email was definitely sent or definitely exists, unless the task says it in so many words.",
        "Keep every string in mustKeepExact exactly as written, even inside another language.",
        spec.languageOf
          ? "The customer last wrote: " + JSON.stringify(spec.languageOf.slice(0, 300)) + ". Reply in the customer's language: Malayalam to Malayalam, English to English. Never announce translation."
          : "Reply in simple English.",
        "Return the message text only. No JSON, no quotes, no preamble.",
      ].join(" "),
      COMPOSE_TIMEOUT_MS,
    );
    const text = stripDashBreaks(content).trim();
    if (!text || text.length > maxChars) return null;
    if (!isSafeConversationText(text)) return null;
    if (claimsUnverifiedFact(text, {})) return null;
    const quality = checkReplyQuality(text, spec.languageOf);
    if (!quality.ok) return null;
    for (const required of spec.mustSay ?? []) {
      if (!text.includes(required)) return null;
    }
    return text;
  } catch {
    return null;
  }
}

// Resolve one account-flow note to the words actually sent: Akif's own wording
// when the brain is up, the fixed line only as a logged outage fallback.
export type NoteSpec = {
  intent: string;
  fallback: string;
  mustSay?: string[];
  neverDo?: string[];
  languageOf?: string;
  maxChars?: number;
};

export async function renderNote(note: NoteSpec): Promise<string> {
  const composed = await composeAkifWording(note);
  if (!composed) {
    console.warn("AKIF compose fallback used", { flow: "account_flow", intent: note.intent.slice(0, 80) });
    return note.fallback;
  }
  return composed;
}
