import { createHash } from "node:crypto";

// Shown before any personal data is collected (DPDP Rule 3 style itemised notice).
// Bump the suffix whenever the wording changes: every user is then asked again.
export const CONSENT_VERSION_SUFFIX = "consent-v3";
export const SITE_BASE = "https://updowncircle.site";
export const TERMS_URL = `${SITE_BASE}/#/terms`;
export const PRIVACY_URL = `${SITE_BASE}/#/privacy`;

export function consentVersion(policyVersion: string) {
  return `${policyVersion}+${CONSENT_VERSION_SUFFIX}`;
}

export function buildConsentNotice(supportEmail: string) {
  return [
    "Welcome to UpDownCircle (UDC).",
    "",
    "International trade, made simpler.",
    "",
    "UDC is for businesses only, for people aged 18+ who are authorised to act for their business. It is not for personal or consumer purchases.",
    "",
    "What we collect, and why:",
    "- Your name, WhatsApp number and business details: to set up and verify your business account.",
    "- Your trade requirements, offers and messages: to match buyers and sellers and track deals.",
    "- Documents you submit: to review verification and deals. Passports, bank and company records go only through a private upload link, never as WhatsApp attachments.",
    "- We never collect Aadhaar numbers.",
    "Your messages go through Meta (WhatsApp) and our service and AI providers. Raw vault documents never go to the AI. Verification decisions are reviewed by people.",
    "",
    `Terms: ${TERMS_URL}`,
    `Privacy: ${PRIVACY_URL}`,
    "",
    'Reply "I agree" only if you are 18+, authorised to represent your business, accept the Terms and consent to the collection and use above.',
    'You can withdraw consent at any time by sending "withdraw consent". To complain, send "complaint".',
    `Help or data requests: ${supportEmail}`,
  ].join("\n");
}

/** Short nudge for a user who already saw the full notice and has not agreed yet. Never counts as consent. */
export function buildConsentReminder(supportEmail: string) {
  return [
    'To continue, reply "I agree" if you are 18+, authorised to act for your business, and accept the Terms and Privacy notice.',
    "",
    `Terms: ${TERMS_URL}`,
    `Privacy: ${PRIVACY_URL}`,
    "",
    `Send "show notice" to read the full notice again. Questions: ${supportEmail}`,
  ].join("\n");
}

export function isShowNoticeRequest(text?: string) {
  const n = (text || "").trim().replace(/[.!?\s]+$/g, "").replace(/\s+/g, " ").toUpperCase();
  return ["SHOW NOTICE", "NOTICE", "SHOW THE NOTICE", "FULL NOTICE", "READ NOTICE"].includes(n);
}

export function noticeHash(notice: string) {
  return createHash("sha256").update(notice).digest("hex");
}

/** Accepts "agree" and "I agree", ignoring case, spacing and end punctuation. */
export function isExplicitAgree(text?: string) {
  const n = (text || "").trim().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ").toUpperCase();
  return n === "AGREE" || n === "I AGREE";
}

export function isWithdrawConsent(text?: string) {
  const n = (text || "").trim().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ").toUpperCase();
  return ["WITHDRAW CONSENT", "WITHDRAW MY CONSENT", "WITHDRAW"].includes(n);
}

export const WITHDRAWN_REPLY =
  'Your consent is withdrawn. I will stop processing your messages and optional notifications. To start again, send "hi" and agree to the notice. To ask for deletion of your data, send "delete my data".';
