import { EMAIL_RELAY_MAILBOX } from "./emailRelayChannel.ts";

/**
 * Approved email send (owner rule, 10 Nov): business email goes out ONLY from
 * udc@updowncircle.site, and ONLY when the owner approved that exact rendered
 * email. There is no automatic caller of this module - the relay-signed
 * /akif-relay/email-send endpoint is invoked by the agent after his preview
 * yes, one draft at a time.
 */

export type EmailThreadContext = { subject?: string; messageId?: string; references?: string[] };

export type RelayEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  headers?: Record<string, string>;
};

/** Pure payload builder so the exact outgoing email is testable. */
export function buildRelayEmailPayload(draft: { to: string; text: string }, thread: EmailThreadContext): RelayEmailPayload {
  const base = (thread.subject ?? "").trim().replace(/^re:\s*/i, "").slice(0, 150);
  const subject = `Re: ${base || "your message to UDC"}`;
  const headers: Record<string, string> = {};
  if (thread.messageId) {
    headers["In-Reply-To"] = thread.messageId;
    headers["References"] = [...(thread.references ?? []), thread.messageId].slice(-10).join(" ");
  }
  return {
    from: EMAIL_RELAY_MAILBOX,
    to: [draft.to],
    subject,
    text: draft.text.slice(0, 12000),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

const MAX_RECEIPT_BYTES = 4_096;

export async function sendRelayEmail(
  payload: RelayEmailPayload,
  deps: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<{ id: string }> {
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(deps.apiKey)) throw new Error("resend_not_configured");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error("email_send_failed");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("email_send_failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RECEIPT_BYTES) throw new Error("email_send_failed");
    chunks.push(value);
  }
  const receipt = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { id?: string };
  if (!receipt.id) throw new Error("email_send_failed");
  return { id: receipt.id };
}
