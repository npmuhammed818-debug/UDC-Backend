// src/akif/answerScoring.ts
var MALAYALAM = /[\u0D00-\u0D7F]/g;
var DEVANAGARI = /[\u0900-\u097F]/g;
var countMatches = (text, re) => (text.match(re) ?? []).length;
function hasMenuStyle(reply) {
  const numbered = countMatches(reply, /(?:^|\n|\s)\d{1,2}[.)]\s+\S/g);
  const bullets = countMatches(reply, /(?:^|\n)\s*(?:[-*•])\s+\S/g);
  return numbered >= 2 || bullets >= 2;
}
var ROBOTIC_ACK = /\b(?:recorded your details|request has been noted|please provide the following|your (?:details|information) (?:have|has) been (?:recorded|submitted|noted))\b/i;
var CLAIMS_HUMAN = /\b(?:i am|i'?m|as a)\s+(?:a\s+)?(?:human|real person|real human|person typing)\b/i;
var APP_MENTION = /\b(?:download|install|open|check|use|see|log ?in to)\s+(?:our\s+|the\s+|this\s+|my\s+)?(?:app|application|dashboard|portal)\b/i;
var AADHAAR = /aadha+r/i;
var COMMISSION_MECHANICS = /(?:\d+(?:\.\d+)?\s*(?:%|percent)\b[\s\S]{0,40}commission|commission[\s\S]{0,40}\d+(?:\.\d+)?\s*(?:%|percent))/i;
var EMAIL_TOKEN = /\S+@\S+/g;
var EMAIL_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function customerScript(customerMessage) {
  if (countMatches(customerMessage, MALAYALAM) >= 3) return "malayalam";
  if (countMatches(customerMessage, DEVANAGARI) >= 3) return "devanagari";
  return null;
}
function checkReplyQuality(reply, customerMessage) {
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
function scoreAkifAnswer(reply, customerMessage) {
  const issues = [];
  if (hasMenuStyle(reply)) issues.push("menu_style");
  if (ROBOTIC_ACK.test(reply)) issues.push("robotic_ack");
  if (CLAIMS_HUMAN.test(reply)) issues.push("claims_human");
  if (APP_MENTION.test(reply)) issues.push("app_mention");
  if (AADHAAR.test(reply)) issues.push("aadhaar_ask");
  if (COMMISSION_MECHANICS.test(reply)) issues.push("commission_mechanics");
  for (const token of reply.match(EMAIL_TOKEN) ?? []) {
    if (!EMAIL_VALID.test(token.replace(/[.,;!?)"']+$/, ""))) {
      issues.push("email_mangled");
      break;
    }
  }
  if (customerMessage) {
    const script = customerScript(customerMessage);
    if (script === "malayalam" && countMatches(reply, MALAYALAM) === 0) issues.push("language_mismatch");
    if (script === "devanagari" && countMatches(reply, DEVANAGARI) === 0) issues.push("language_mismatch");
  }
  return { score: Math.max(0, 100 - issues.length * 25), issues };
}
function scoreTranscript(exchanges) {
  const scored = exchanges.map((ex) => ({ ...ex, ...scoreAkifAnswer(ex.akif, ex.customer) }));
  const flagged = scored.filter((s) => s.issues.length > 0);
  const total = scored.length ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 100;
  return { score: total, worst: flagged.map((f) => ({ customer: f.customer, akif: f.akif, issues: f.issues })) };
}
export {
  checkReplyQuality,
  scoreAkifAnswer,
  scoreTranscript
};
