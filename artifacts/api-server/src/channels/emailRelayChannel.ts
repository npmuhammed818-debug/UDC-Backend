import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalEmail, safeEmailAttachment, type EmailEvidence } from "./emailPilot.ts";
import { EMAIL_RELAY_PREFIX, enqueueHumanRelay, isEmailRelayContact, relayContactKey } from "../akif/humanRelay.ts";

/**
 * Email channel, Phase A (owner direction, 10 Nov): an email to
 * udc@updowncircle.site enters the SAME human-relay queue the WhatsApp
 * workers already answer, keyed as "email:<address>". Workers claim and
 * answer it like any other held item; the answer is saved as a review draft
 * and never sent (Phase B flips real delivery on only after the owner's yes).
 *
 * This module is synthetic-only: no live mailbox, no provider, no real send.
 * Validation mirrors processEmailPilot so the two email doors never drift.
 */

export const EMAIL_RELAY_MAILBOX = "udc@updowncircle.site";

export function emailRelayContact(address: string): string {
  return EMAIL_RELAY_PREFIX + address.toLowerCase();
}

export function syntheticEmailRelayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.UDC_APP_ENV === "staging" && env.UDC_EMAIL_PILOT_MODE === "synthetic" && env.AKIF_WHATSAPP_REPLY_SINK === "store";
}

/** Same HMAC fixture gate as emailSyntheticReceiver: a synthetic envelope is
 *  not provider evidence and never authenticates a live sender. */
export function verifySyntheticRelaySignature(raw: string, timestamp: string, signature: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.UDC_EMAIL_SYNTHETIC_DELIVERY_SECRET;
  if (!secret || secret.length < 32) return false;
  if (raw.length > 30000 || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 120000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "\n" + raw).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export type EmailRelayPorts = {
  /** Registered account for this verified address, when one exists. */
  resolveAccount(address: string): Promise<{ role: string; status: string; verified: boolean } | null>;
};

function validEvent(event: EmailEvidence): boolean {
  return Boolean(event) && typeof event === "object" && !Array.isArray(event)
    && ["eventId", "messageId", "threadId", "from", "subject", "text"].every((key) => typeof (event as unknown as Record<string, unknown>)[key] === "string")
    && Array.isArray(event.to) && Array.isArray(event.cc) && [...event.to, ...event.cc].every((v) => typeof v === "string")
    && (event.replyTo === undefined || typeof event.replyTo === "string")
    && typeof event.autoSubmitted === "boolean" && typeof event.bulk === "boolean"
    && Array.isArray(event.attachments) && event.attachments.every((a) => a && typeof a.id === "string" && typeof a.name === "string" && typeof a.type === "string" && typeof a.bytes === "number");
}

export async function receiveSyntheticEmailRelay(event: EmailEvidence, ports: EmailRelayPorts, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (!syntheticEmailRelayEnabled(env)) return "disabled";
  if (!validEvent(event)) return "invalid";
  const from = canonicalEmail(event.from);
  if (!from || from === EMAIL_RELAY_MAILBOX || event.to.length !== 1 || canonicalEmail(event.to[0]) !== EMAIL_RELAY_MAILBOX || event.cc.length
    || (event.replyTo && canonicalEmail(event.replyTo) !== from)) return "audience_review_required";
  if (event.autoSubmitted || event.bulk) return "loop_or_bulk_ignored";
  if (!event.eventId || !event.messageId || !event.threadId
    || [event.messageId, event.threadId, event.subject].some((v) => /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(v))
    || event.subject.length > 180 || event.text.length > 6000 || !event.text.trim()) return "invalid";
  // Documents by email stay on the private review path: never folded into a
  // customer-facing relay turn sight unseen (matches processEmailPilot).
  if (event.attachments.length) {
    if (event.attachments.length > 5 || event.attachments.some((a) => !safeEmailAttachment(a))) return "unsafe_attachment";
    return "private_attachment_review_required";
  }
  const account = await ports.resolveAccount(from);
  // The worker note states what the system knows, including the owner rule
  // (10 Nov): agents may use any email and need no company details.
  const note = account
    ? `registered ${account.role}, account ${account.status}, email ${account.verified ? "confirmed" : "not confirmed"}`
    : "not registered by email; agents may use any email and need no company details, buyers/sellers need a company email, company name and country";
  enqueueHumanRelay({
    phone: emailRelayContact(from),
    kind: "text",
    text: `Subject: ${event.subject}\n\n${event.text.trim()}`.slice(0, 4000),
    customerNote: `channel email; ${note}`,
  });
  return "held_for_human_relay";
}

/** Validate and normalize a worker's email answer target. Returns the bare
 *  address or null. The send path must use this, never raw input. */
export function emailRelayTarget(contact: string): string | null {
  return isEmailRelayContact(contact) ? contact.slice(EMAIL_RELAY_PREFIX.length) : null;
}

export { relayContactKey };
