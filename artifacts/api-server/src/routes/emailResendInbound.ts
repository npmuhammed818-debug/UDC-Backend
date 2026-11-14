import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import {
  liveDbPorts,
  processLiveEmailMessage,
  type LiveEmailInboundPorts,
  type ParsedMail,
} from "../channels/emailLiveInbound.ts";
import { logger } from "../lib/logger.ts";

/**
 * Resend inbound email intake (14 Nov, replaces the third-party mailbox plan
 * after every free mailbox provider walled off signup without a phone
 * verification the owner cannot do). Resend receives mail for
 * udc@updowncircle.site (MX cutover) and POSTs an email.received webhook
 * here; the body/attachments are then pulled from the Received Emails API
 * and fed into the SAME claim + filter + human-relay pipeline the IMAP
 * poller uses (processLiveEmailMessage). Nothing is ever sent automatically:
 * worker answers stay review drafts until the owner approves a preview.
 *
 * Two env switches, both required: RESEND_WEBHOOK_SECRET (Svix whsec_...
 * signing secret of this webhook) and RESEND_API_KEY (full access; the
 * received-email content is retrieved over the API).
 */

const RESEND_API_BASE = "https://api.resend.com";
const SVIX_TOLERANCE_SEC = 300;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Verify a Svix-signed Resend webhook against the raw request body. */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > SVIX_TOLERANCE_SEC) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Map a Resend received-email API response (+ attachment list) onto the
 *  ParsedMail shape the shared live pipeline already understands. */
export function resendEmailToParsedMail(
  full: Record<string, unknown>,
  attachments: Array<{ contentId?: string; filename?: string; contentType?: string; content: Buffer }>,
  fallback: { emailId: string; from?: string; subject?: string; messageId?: string },
): ParsedMail {
  const headersRaw = (full.headers && typeof full.headers === "object" ? full.headers : {}) as Record<string, unknown>;
  const headers = new Map<string, unknown>();
  for (const [name, value] of Object.entries(headersRaw)) headers.set(name.toLowerCase(), value);
  const addr = (v: unknown) => ({ value: [{ address: String(v ?? "") }] });
  const list = (v: unknown) => ({ value: (Array.isArray(v) ? v : v ? [v] : []).map((a) => ({ address: String(a ?? "") })) });
  const text = typeof full.text === "string" && full.text.trim()
    ? full.text
    : typeof full.html === "string"
      ? full.html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
  return {
    messageId: String(full.message_id ?? fallback.messageId ?? `resend-${fallback.emailId}`),
    references: typeof headers.get("references") === "string" ? String(headers.get("references")).split(/\s+/).filter(Boolean) : undefined,
    from: addr(full.from ?? fallback.from ?? ""),
    to: list(full.to),
    cc: list(full.cc),
    replyTo: headers.get("reply-to") ? addr(headers.get("reply-to")) : undefined,
    subject: String(full.subject ?? fallback.subject ?? ""),
    text,
    date: full.created_at ? new Date(String(full.created_at)) : new Date(),
    headers,
    attachments,
  };
}

export type ResendInboundDeps = {
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
  ports?: Omit<LiveEmailInboundPorts, "connect">;
};

export function createEmailResendInboundRouter(deps: ResendInboundDeps = {}): Router {
  const router = Router();

  router.post("/email/resend-inbound", async (req: Request, res) => {
    res.set("cache-control", "no-store");
    const env = deps.env ?? process.env;
    const secret = env.RESEND_WEBHOOK_SECRET;
    const apiKey = env.RESEND_API_KEY;
    if (!secret || !apiKey) {
      res.status(503).json({ error: "resend_inbound_not_configured" });
      return;
    }
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? JSON.stringify(req.body ?? {});
    const ok = verifyResendWebhookSignature(rawBody, {
      id: req.header("svix-id") ?? undefined,
      timestamp: req.header("svix-timestamp") ?? undefined,
      signature: req.header("svix-signature") ?? undefined,
    }, secret);
    if (!ok) {
      res.status(401).json({ error: "invalid_signature" });
      return;
    }
    const event = req.body as { type?: string; data?: Record<string, unknown> } | undefined;
    if (event?.type !== "email.received") {
      res.json({ ignored: true });
      return;
    }
    const emailId = String(event.data?.email_id ?? "");
    if (!emailId) {
      res.status(400).json({ error: "missing_email_id" });
      return;
    }
    const fetchFn = deps.fetchFn ?? (fetch as unknown as FetchLike);
    const ports = deps.ports ?? liveDbPorts(env);
    try {
      const auth = { headers: { Authorization: `Bearer ${apiKey}` } };
      const fullRes = await fetchFn(`${RESEND_API_BASE}/emails/receiving/${encodeURIComponent(emailId)}`, auth);
      if (!fullRes.ok) throw new Error(`retrieve_http_${fullRes.status}`);
      const full = (await fullRes.json()) as Record<string, unknown>;
      const attRes = await fetchFn(`${RESEND_API_BASE}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, auth);
      const attList = attRes.ok ? ((await attRes.json()) as { data?: Array<Record<string, unknown>> }).data ?? [] : [];
      const attachments = [];
      for (const att of attList.slice(0, 10)) {
        const downloadUrl = typeof att.download_url === "string" ? att.download_url : "";
        const size = Number(att.size ?? 0);
        if (!downloadUrl || size > MAX_ATTACHMENT_BYTES) continue;
        try {
          const bin = await fetchFn(downloadUrl);
          if (!bin.ok) continue;
          attachments.push({
            contentId: typeof att.content_id === "string" ? att.content_id : undefined,
            filename: typeof att.filename === "string" ? att.filename : undefined,
            contentType: typeof att.content_type === "string" ? att.content_type : undefined,
            content: Buffer.from(await bin.arrayBuffer()),
          });
        } catch {
          // One unreadable attachment never sinks the email; the pipeline
          // notes stored=0 for files it cannot keep.
        }
      }
      const parsed = resendEmailToParsedMail(full, attachments, {
        emailId,
        from: typeof event.data?.from === "string" ? event.data.from : undefined,
        subject: typeof event.data?.subject === "string" ? event.data.subject : undefined,
        messageId: typeof event.data?.message_id === "string" ? event.data.message_id : undefined,
      });
      const result = await processLiveEmailMessage(emailId, parsed, ports, env);
      logger.info({ emailResendInbound: true, state: result.state, held: result.held, alreadyProcessed: result.alreadyProcessed }, "resend inbound email processed");
      res.json({ ok: true, state: result.state });
    } catch (err) {
      // Error name only, never message text that could carry content.
      logger.warn({ emailResendInbound: true, errorName: (err as Error)?.name ?? "unknown" }, "resend inbound processing failed");
      res.status(500).json({ error: "processing_failed" });
    }
  });

  return router;
}

export default createEmailResendInboundRouter();
