// Pure conversation rules for AKIF. No I/O, no model calls, no invented facts.

const HANDOFF = /\b(?:talk|speak|connect|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+)?(?:human|person|real person|agent|someone|staff|team|representative|manager|support)\b|\b(?:human|real person|live agent|customer support|customer care|support team)\b.*\b(?:please|need|want|help)\b|\b(?:call me|phone me)\b|\b(?:i (?:want|need) to complain|file a complaint|this is (?:wrong|a scam))\b/i;

export function wantsHumanHelp(text: string | null | undefined) {
  return typeof text === "string" && text.length <= 1000 && HANDOFF.test(text);
}

export const HUMAN_HANDOFF_REPLY =
  "Understood - I've flagged this for the UDC team so a person can follow up with you here. I can't promise an exact time. You can keep asking me questions in the meantime.";

export type Turn = "answer" | "question" | "correction" | "menu_request" | "pause" | "resume";

// Decide how a message relates to the question AKIF last asked. A question or
// correction must never be stored as the answer to the pending field.
export function classifyTurn(text: string, hasPendingQuestion: boolean): Turn {
  const t = text.trim();
  if (/^(?:menu|show menu|open menu)[.!?]*$/i.test(t)) return "menu_request";
  if (/^(?:continue|resume|carry on|go on|back to (?:it|that|my (?:request|offer|registration)))[.!?]*$/i.test(t)) return "resume";
  if (/^(?:wait|hold on|stop|later|not now|pause|never ?mind)[.!?]*$/i.test(t)) return "pause";
  if (/^(?:no[, ]+|sorry[, ]+|actually|i meant|correction|change (?:it|that)|that'?s wrong|not\b)/i.test(t)) return "correction";
  if (/\?\s*$/.test(t) || /^(?:what|why|how|when|where|who|which|can you|could you|do you|does|is it|are you|explain|tell me)\b/i.test(t)) return "question";
  return hasPendingQuestion ? "answer" : "question";
}

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

// If the same question would be sent again verbatim, rephrase once so the
// customer never gets an identical robotic repeat.
export function avoidRepeat(recentBotMessages: string[], candidate: string, rephrase: (s: string) => string = defaultRephrase) {
  const seen = new Set(recentBotMessages.slice(-3).map(normalise));
  return seen.has(normalise(candidate)) ? rephrase(candidate) : candidate;
}
function defaultRephrase(s: string) {
  return `Just to make sure I have this right - ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

// Status replies are composed only from facts the database confirmed.
export type DealFacts = {
  dealStatus?: string | null;
  paymentConfirmedByBank?: boolean;
  inspectionResultOnFile?: "passed" | "failed" | "pending" | null;
  latestTrackingEvent?: { kind: string; at: string; source: string } | null;
};
export function groundedStatusReply(facts: DealFacts | null | undefined) {
  if (!facts) return "I don't have a confirmed record for that yet, so I won't guess. UDC can check it for you.";
  const lines: string[] = [];
  lines.push(facts.dealStatus ? `Deal status on record: ${facts.dealStatus}.` : "No deal status is recorded yet.");
  lines.push(facts.paymentConfirmedByBank ? "Payment: confirmed on record." : "Payment: no bank confirmation on record.");
  lines.push(
    facts.inspectionResultOnFile === "passed" ? "Inspection: a passed result is on file." :
    facts.inspectionResultOnFile === "failed" ? "Inspection: a failed result is on file." :
    facts.inspectionResultOnFile === "pending" ? "Inspection: pending." : "Inspection: no result on file.");
  lines.push(facts.latestTrackingEvent
    ? `Latest shipment event: ${facts.latestTrackingEvent.kind} (${facts.latestTrackingEvent.source}, ${facts.latestTrackingEvent.at}).`
    : "Shipment: no tracking event on record.");
  return lines.join("\n");
}

// Offered when the AI provider fails: honest, short, and it keeps the thread.
export const AI_FALLBACK_REPLY =
  "I couldn't prepare a good answer just now. Nothing you told me was lost. Please try again in a moment, or say 'talk to a person' and I'll flag it for the UDC team.";

// Any sentence that would present a match, price, payment, inspection or shipment
// progress as fact must be backed by a confirmed record; otherwise block it.
const FACT_CLAIM = /\b(?:payment (?:has been |was )?(?:received|confirmed|completed)|inspection (?:passed|completed|cleared)|shipment (?:has )?(?:departed|arrived|is on its way|cleared customs)|seller (?:has )?accepted|matched you with)\b/i;
export function claimsUnverifiedFact(reply: string, verified: { payment?: boolean; inspection?: boolean; shipment?: boolean; match?: boolean }) {
  const m = reply.match(FACT_CLAIM);
  if (!m) return false;
  const c = m[0].toLowerCase();
  if (c.startsWith("payment")) return !verified.payment;
  if (c.startsWith("inspection")) return !verified.inspection;
  if (c.startsWith("shipment")) return !verified.shipment;
  return !verified.match;
}
