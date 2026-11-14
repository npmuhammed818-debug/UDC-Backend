import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalEmail, safeEmailAttachment, type EmailEvidence } from "./emailPilot.ts";
import { attachmentContent } from "./emailAttachmentIntake.ts";
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

/** Live inbound (owner yes, 10 Nov): the real udc@updowncircle.site mailbox is
 *  polled when its IMAP password is present. His adding that one env var is
 *  the switch; removing it turns the inbox back off. No app-env check: the
 *  launch service runs as "production" and this is a live channel, not a
 *  synthetic door. Outbound still never sends automatically - every answer
 *  waits for his preview approval.
 *  14 Nov: Resend inbound webhooks are an equivalent live source - with the
 *  mailbox providers all walled off, signed Resend webhook delivery takes
 *  over from IMAP polling. Either credential keeps the channel live. */
export function liveEmailRelayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof env.UDC_EMAIL_IMAP_PASS === "string" && env.UDC_EMAIL_IMAP_PASS.length > 0) return true;
  return typeof env.RESEND_WEBHOOK_SECRET === "string" && env.RESEND_WEBHOOK_SECRET.length > 0;
}

/** Same HMAC fixture gate as emailSyntheticReceiver: a synthetic envelope is
 *  not provider evidence and never authenticates a live sender. The raw cap is
 *  larger than the pilot receiver's because signed fixtures may carry small
 *  attachment content (base64) for the confidential-document intake. */
export function verifySyntheticRelaySignature(raw: string, timestamp: string, signature: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.UDC_EMAIL_SYNTHETIC_DELIVERY_SECRET;
  if (!secret || secret.length < 32) return false;
  if (raw.length > 2_000_000 || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 120000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "\n" + raw).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export type EmailRelayPorts = {
  /** Registered account for this verified address, when one exists. */
  resolveAccount(address: string): Promise<{ role: string; status: string; verified: boolean } | null>;
  /** Confidential-document intake: files go straight to the protected store,
   *  never to workers. Without it, attachment emails stay in private review. */
  storeEmailAttachments?(input: { from: string; messageId: string; attachments: EmailEvidence["attachments"]; synthetic: boolean }): Promise<{ stored: number }>;
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
  return receiveEmailRelay(event, ports, "synthetic");
}

/** Live mailbox intake. Unlike the synthetic fixture path, a real customer
 *  always reaches the workers: documents that cannot be stored are noted as
 *  not stored instead of dropping the whole email. */
export async function receiveLiveEmailRelay(event: EmailEvidence, ports: EmailRelayPorts, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (!liveEmailRelayEnabled(env)) return "disabled";
  return receiveEmailRelay(event, ports, "live");
}

async function receiveEmailRelay(event: EmailEvidence, ports: EmailRelayPorts, mode: "synthetic" | "live"): Promise<string> {
  if (!validEvent(event)) return "invalid";
  const from = canonicalEmail(event.from);
  if (!from || from === EMAIL_RELAY_MAILBOX || event.to.length !== 1 || canonicalEmail(event.to[0]) !== EMAIL_RELAY_MAILBOX || event.cc.length
    || (event.replyTo && canonicalEmail(event.replyTo) !== from)) return "audience_review_required";
  if (event.autoSubmitted || event.bulk) return "loop_or_bulk_ignored";
  if (!event.eventId || !event.messageId || !event.threadId
    || [event.messageId, event.threadId, event.subject].some((v) => /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(v))
    || event.subject.length > 180 || event.text.length > 6000 || !event.text.trim()) return "invalid";
  // Documents by email (owner direction, 10 Nov): confidential files go
  // straight to the protected store - never to workers or chat - while the
  // message text still enters the relay queue so the same worker system
  // answers, exactly like WhatsApp. Content-less fixtures keep the old
  // private-review behavior.
  let documentsNote = "";
  let storeFailed = false;
  if (event.attachments.length) {
    const clean = event.attachments.length <= 5 && event.attachments.every((a) => safeEmailAttachment(a) && attachmentContent(a));
    if (!clean) {
      // Synthetic fixtures fail closed; a live customer still reaches the
      // workers, with the document simply not stored.
      if (mode === "synthetic") {
        if (event.attachments.length > 5 || event.attachments.some((a) => !safeEmailAttachment(a))) return "unsafe_attachment";
        return "private_attachment_review_required";
      }
      documentsNote = `; sent ${event.attachments.length} document(s) we could not store (only PDF/JPG/PNG up to 20MB) - NOT stored, worker should offer a resend`;
    } else if (!ports.storeEmailAttachments) {
      if (mode === "synthetic") return "attachment_store_unavailable";
      documentsNote = `; sent ${event.attachments.length} document(s) - NOT stored (store unavailable), worker should offer a resend`;
    } else {
      try {
        const { stored } = await ports.storeEmailAttachments({ from, messageId: event.messageId, attachments: event.attachments, synthetic: mode === "synthetic" });
        documentsNote = `; received ${stored} confidential document(s) by email, stored privately - never shown in chat or to workers`;
      } catch {
        if (mode === "synthetic") return "attachment_store_failed";
        storeFailed = true;
        documentsNote = `; sent ${event.attachments.length} document(s) - NOT stored (store error), worker should offer a resend`;
      }
    }
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
    customerNote: `channel email${documentsNote}; ${note}`,
  });
  return storeFailed ? "held_attachment_store_failed" : "held_for_human_relay";
}

/** Validate and normalize a worker's email answer target. Returns the bare
 *  address or null. The send path must use this, never raw input. */
export function emailRelayTarget(contact: string): string | null {
  return isEmailRelayContact(contact) ? contact.slice(EMAIL_RELAY_PREFIX.length) : null;
}

export { relayContactKey };
