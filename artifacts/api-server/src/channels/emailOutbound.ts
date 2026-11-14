import { createTransport } from "nodemailer";
import { EMAIL_RELAY_MAILBOX } from "./emailRelayChannel.ts";

/**
 * Outbound email (owner direction, 10 Nov): worker answers to inbound
 * customer emails go out automatically from udc@updowncircle.site over the
 * mailbox's own Titan SMTP - the same mailbox the poller reads, so the
 * customer sees one continuous thread and the Sent copy stays in the
 * mailbox. Emails UDC starts itself (supplier/broker outreach, anything not
 * a reply) still wait for his yes on a preview, one draft at a time, via the
 * relay-signed /akif-relay/email-send endpoint.
 *
 * Transport env: UDC_EMAIL_IMAP_PASS (the mailbox password, already the
 * inbound switch) plus optional UDC_EMAIL_SMTP_HOST / _PORT / _SECURE /
 * UDC_EMAIL_IMAP_USER overrides.
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

export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; pass: string };
export type SendMailFn = (payload: RelayEmailPayload) => Promise<{ id: string }>;

/** SMTP settings from the environment; null config means the mailbox
 *  password is absent, so outbound is off (same switch as inbound). */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const pass = (env.UDC_EMAIL_IMAP_PASS ?? "").trim();
  if (!pass) return null;
  const port = Number(env.UDC_EMAIL_SMTP_PORT || 465);
  return {
    host: (env.UDC_EMAIL_SMTP_HOST ?? "").trim() || "smtp.titan.email",
    port: Number.isFinite(port) && port > 0 ? port : 465,
    secure: env.UDC_EMAIL_SMTP_SECURE !== "false",
    user: (env.UDC_EMAIL_IMAP_USER ?? "").trim() || EMAIL_RELAY_MAILBOX,
    pass,
  };
}

/** Send the exact payload. Tests inject sendMail; production uses Titan SMTP. */
export async function sendRelayEmail(
  payload: RelayEmailPayload,
  deps: OutboundDeps,
): Promise<{ id: string }> {
  if (deps.sendMail) return deps.sendMail(payload);
  if (deps.resendApiKey) return sendViaResend(payload, deps.resendApiKey, deps.fetchImpl);
  if (!deps.config) throw new Error("smtp_not_configured");
  const transporter = createTransport({
    host: deps.config.host,
    port: deps.config.port,
    secure: deps.config.secure,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: { user: deps.config.user, pass: deps.config.pass },
  });
  try {
    const info = await transporter.sendMail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      ...(payload.headers ? { headers: payload.headers } : {}),
    });
    const id = typeof info?.messageId === "string" && info.messageId.trim() ? info.messageId.trim() : "smtp-accepted";
    return { id };
  } finally {
    transporter.close();
  }
}

const MAX_RECEIPT_BYTES = 4_096;

/** Resend HTTP transport: used when UDC_EMAIL_OUTBOUND=resend (the live
 *  choice while the service plan blocks SMTP ports). The from domain must be
 *  verified in Resend (updowncircle.site, DNS verified 11 Nov). */
async function sendViaResend(payload: RelayEmailPayload, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) throw new Error("resend_not_configured");
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel().catch(() => {});
    throw new Error(`email_send_failed_resend_${status}`);
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

export type OutboundDeps = { config: SmtpConfig | null; resendApiKey?: string; sendMail?: SendMailFn; fetchImpl?: typeof fetch };

/** Transport choice from env: UDC_EMAIL_OUTBOUND=resend uses the Resend HTTP
 *  API (works where SMTP ports are blocked); anything else uses Titan SMTP. */
export function outboundDepsFromEnv(env: NodeJS.ProcessEnv = process.env): OutboundDeps {
  const useResend = (env.UDC_EMAIL_OUTBOUND ?? "").trim().toLowerCase() === "resend";
  return {
    config: smtpConfigFromEnv(env),
    resendApiKey: useResend ? (env.RESEND_API_KEY ?? "").trim() : undefined,
  };
}
