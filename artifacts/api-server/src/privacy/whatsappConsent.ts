import { isExplicitAgree } from "./consentNotice.ts";
export type WhatsAppPrivacyState = "none" | "notice_sent" | "accepted" | "withdrawn";
export function privacyCommand(text?: string) {
  const normalized = (text || "").trim().toUpperCase();
  if (["STOP", "UNSUBSCRIBE"].includes(normalized)) return "stop";
  if (["PRIVACY", "PRIVACY POLICY"].includes(normalized)) return "privacy";
  if (["DELETE MY DATA", "DATA DELETION"].includes(normalized))
    return "deletion";
  return null;
}
export function decideWhatsAppConsent(
  input: { text?: string; state: WhatsAppPrivacyState; version?: string },
  currentPolicyVersion: string,
) {
  const accepted =
    input.state === "accepted" && input.version === currentPolicyVersion;
  if (accepted) return "continue" as const;
  const confirmed = isExplicitAgree(input.text);
  return input.state === "notice_sent" &&
    input.version === currentPolicyVersion &&
    confirmed
    ? ("accept" as const)
    : ("notice" as const);
}
