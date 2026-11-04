import { createHash } from "node:crypto";

// Shown before any personal data is collected (DPDP Rule 3 style itemised notice).
// Bump the suffix whenever the wording changes: every user is then asked again.
export const CONSENT_VERSION_SUFFIX = "consent-v4";
export const SITE_BASE = "https://updowncircle.site";
export const TERMS_URL = `${SITE_BASE}/#/terms`;
export const PRIVACY_URL = `${SITE_BASE}/#/privacy`;

export function consentVersion(policyVersion: string) {
  return `${policyVersion}+${CONSENT_VERSION_SUFFIX}`;
}

export function buildConsentNotice(supportEmail: string) {
  return [
    "Welcome to UpDownCircle (UDC). International trade, made simpler. UDC is for businesses only, for people 18+ who are authorised to act for their business.",
    "",
    "We collect your name, WhatsApp number, business details, trade requirements and the documents you send (only through a private link) to set up your account, verify you and match buyers and sellers. Your messages go through Meta (WhatsApp) and our service and AI providers, and people review verification decisions.",
    "",
    `Terms: ${TERMS_URL}`,
    `Privacy: ${PRIVACY_URL}`,
    "",
    'Reply "I agree" if you are 18+, authorised for your business, and accept the Terms and this use of your data. Send "withdraw consent" any time to stop.',
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
  'Your consent is withdrawn. I will not process your messages, documents or voice notes until you agree to the notice again. Optional notifications and reminders are off. Your account and the details you already gave are kept until you ask for deletion. To ask for deletion, send "delete my data". To start again, send "hi" and agree to the notice.';
