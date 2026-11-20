// AKIF answer scoring (Phase 9 item 2, owner-approved 29 Oct; weak-spot fixes
// approved 30 Oct batch). Deterministic rubric checks, no model calls: honest
// AI, human-like words, trade rules, customer-language match. Used two ways:
//   1. As a guard before a brain reply reaches the customer (registration
//      intake today) - a failed reply falls back to the fixed flow.
//   2. Offline, to score captured transcripts and find weak spots.
// Every check is conservative: when in doubt, do NOT flag, so the guard never
// eats a good reply.

const MALAYALAM = /[\u0D00-\u0D7F]/g;
const DEVANAGARI = /[\u0900-\u097F]/g;

const countMatches = (text: string, re: RegExp) => (text.match(re) ?? []).length;

function hasMenuStyle(reply: string): boolean {
  const numbered = countMatches(reply, /(?:^|\n|\s)\d{1,2}[.)]\s+\S/g);
  const bullets = countMatches(reply, /(?:^|\n)\s*(?:[-*•])\s+\S/g);
  return numbered >= 2 || bullets >= 2;
}

const ROBOTIC_ACK = /\b(?:recorded your details|request has been noted|please provide the following|your (?:details|information) (?:have|has) been (?:recorded|submitted|noted))\b/i;
const CLAIMS_HUMAN = /\b(?:i am|i'?m|as a)\s+(?:a\s+)?(?:human|real person|real human|person typing)\b/i;
const APP_MENTION = /\b(?:download|install|open|check|use|see|log ?in to)\s+(?:our\s+|the\s+|this\s+|my\s+)?(?:app|application|dashboard|portal)\b/i;
const AADHAAR = /aadha+r/i;
const COMMISSION_MECHANICS = /(?:\d+(?:\.\d+)?\s*(?:%|percent)\b[\s\S]{0,40}commission|commission[\s\S]{0,40}\d+(?:\.\d+)?\s*(?:%|percent))/i;
const EMAIL_TOKEN = /\S+@\S+/g;
const EMAIL_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function customerScript(customerMessage: string): "malayalam" | "devanagari" | null {
  if (countMatches(customerMessage, MALAYALAM) >= 3) return "malayalam";
  if (countMatches(customerMessage, DEVANAGARI) >= 3) return "devanagari";
  return null;
}

export type QualityIssue =
  | "menu_style"
  | "robotic_ack"
  | "claims_human"
  | "app_mention"
  | "aadhaar_ask"
  | "commission_mechanics"
  | "email_mangled"
  | "language_mismatch";

export function checkReplyQuality(reply: string, customerMessage?: string): { ok: true } | { ok: false; issue: QualityIssue } {
  if (hasMenuStyle(reply)) return { ok: false, issue: "menu_style" };
  if (ROBOTIC_ACK.test(reply)) return { ok: false, issue: "robotic_ack" };
  if (CLAIMS_HUMAN.test(reply)) return { ok: false, issue: "claims_human" };
  if (APP_MENTION.test(reply)) return { ok: false, issue: "app_mention" };
  if (AADHAAR.test(reply)) return { ok: false, issue: "aadhaar_ask" };
  if (COMMISSION_MECHANICS.test(reply)) return { ok: false, issue: "commission_mechanics" };
  for (const token of reply.match(EMAIL_TOKEN) ?? []) {
    if (!EMAIL_VALID.test(token.replace(/[.,;!?)"']+$/, ""))) return { ok: false, issue: "email_mangled" };
  }
  if (customerMessage) {
    const script = customerScript(customerMessage);
    if (script === "malayalam" && countMatches(reply, MALAYALAM) === 0) return { ok: false, issue: "language_mismatch" };
    if (script === "devanagari" && countMatches(reply, DEVANAGARI) === 0) return { ok: false, issue: "language_mismatch" };
  }
  return { ok: true };
}

// Offline scoring: one answer, full issue list and a 0-100 score.
export function scoreAkifAnswer(reply: string, customerMessage?: string): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  if (hasMenuStyle(reply)) issues.push("menu_style");
  if (ROBOTIC_ACK.test(reply)) issues.push("robotic_ack");
  if (CLAIMS_HUMAN.test(reply)) issues.push("claims_human");
  if (APP_MENTION.test(reply)) issues.push("app_mention");
  if (AADHAAR.test(reply)) issues.push("aadhaar_ask");
  if (COMMISSION_MECHANICS.test(reply)) issues.push("commission_mechanics");
  for (const token of reply.match(EMAIL_TOKEN) ?? []) {
    if (!EMAIL_VALID.test(token.replace(/[.,;!?)"']+$/, ""))) { issues.push("email_mangled"); break; }
  }
  if (customerMessage) {
    const script = customerScript(customerMessage);
    if (script === "malayalam" && countMatches(reply, MALAYALAM) === 0) issues.push("language_mismatch");
    if (script === "devanagari" && countMatches(reply, DEVANAGARI) === 0) issues.push("language_mismatch");
  }
  return { score: Math.max(0, 100 - issues.length * 25), issues };
}

// Offline scoring: a whole captured conversation.
export function scoreTranscript(exchanges: { customer: string; akif: string }[]): { score: number; worst: { customer: string; akif: string; issues: QualityIssue[] }[] } {
  const scored = exchanges.map(ex => ({ ...ex, ...scoreAkifAnswer(ex.akif, ex.customer) }));
  const flagged = scored.filter(s => s.issues.length > 0);
  const total = scored.length ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 100;
  return { score: total, worst: flagged.map(f => ({ customer: f.customer, akif: f.akif, issues: f.issues })) };
}
