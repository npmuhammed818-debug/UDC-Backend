import { createHmac } from "node:crypto";
import { EMAIL_RELAY_MAILBOX, liveEmailRelayEnabled, receiveLiveEmailRelay, type EmailRelayPorts } from "./emailRelayChannel.ts";
import { storeConfidentialEmailAttachments } from "./emailAttachmentIntake.ts";
import type { EmailEvidence } from "./emailPilot.ts";

/**
 * Live mailbox inbound (owner yes, 10 Nov): poll the real
 * udc@updowncircle.site Titan mailbox over IMAP and feed each new email into
 * the SAME human-relay queue the WhatsApp workers answer. Attachments go
 * straight to the protected document store, never to workers. Nothing is
 * ever sent automatically: worker answers stay review drafts until the owner
 * approves a rendered preview.
 *
 * The poller only runs when UDC_EMAIL_IMAP_PASS is set (the owner's one
 * switch). Every message is claimed in audit_logs BEFORE processing so a
 * redeploy or crash never answers one email twice; the claim row also keeps
 * the subject and Message-Id so the approved reply threads correctly.
 */

const POLL_MS = 60_000;
const MAX_PER_CYCLE = 10;

/** Go-live floor (owner direction, 10 Nov): only mail sent after the channel
 *  was approved (7:37 PM PST) may reach the workers. Older mail - the whole
 *  historic inbox - is marked read and never queued. */
export const EMAIL_LIVE_NOT_BEFORE = Date.parse("2026-11-11T03:37:00.000Z");

/** Bulk/promo/vendor mail never reaches the worker queue (owner direction,
 *  10 Nov): it is marked read and claimed as processed, silently. */
export function bulkMailReason(parsed: { headers?: Map<string, unknown>; date?: Date }, from: string): string | null {
  const header = (name: string) => String(parsed.headers?.get(name) ?? "").toLowerCase();
  if (header("list-unsubscribe") !== "" || header("list-id") !== "") return "list_mail";
  if (["bulk", "list", "junk"].includes(header("precedence"))) return "bulk_precedence";
  const auto = header("auto-submitted");
  if (auto !== "" && auto !== "no") return "auto_submitted";
  const local = from.split("@")[0]?.toLowerCase() ?? "";
  // Machine senders only - a real supplier may well write from sales@ or
  // info@, so human-plausible local parts are never filtered here.
  if (/^(no[-_.]?reply|donotreply|do[-_.]not[-_.]reply|bounce|mailer[-_.]?daemon|newsletter|notifications?|promo|marketing|digest)$/.test(local)) return "vendor_sender";
  if (parsed.date && parsed.date.getTime() < EMAIL_LIVE_NOT_BEFORE) return "before_go_live";
  return null;
}

/** Quarantined senders (main-agent request, 11 Nov): mail from these
 *  addresses is marked read and claimed as ignored_quarantined_sender,
 *  never queued for workers and never answered. Comma-separated,
 *  case-insensitive env list; empty means nobody is quarantined. Used for
 *  an address making an unverified owner-identity claim. */
export function quarantinedSenderReason(env: NodeJS.ProcessEnv, from: string): string | null {
  const list = (env.UDC_EMAIL_RELAY_QUARANTINE ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return null;
  return list.includes(from.trim().toLowerCase()) ? "quarantined_sender" : null;
}

export type LiveEmailClaim = { state: string; meta?: Record<string, unknown> };

export type LiveEmailInboundPorts = EmailRelayPorts & {
  /** IMAP client factory (imapflow in production, a fake in tests). */
  connect(): Promise<LiveImapClient>;
  /** Claim lookup/insert/update on audit_logs. */
  claimLookup(messageHash: string): Promise<LiveEmailClaim | null>;
  claimInsert(messageHash: string, meta: Record<string, unknown>): Promise<void>;
  claimUpdate(messageHash: string, state: string): Promise<void>;
};

export type LiveImapMessage = { uid: number; source: Buffer };
export type LiveImapClient = {
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: { seen: boolean }): Promise<number[]>;
  fetchOne(uid: number, query: { source: true }, opts: { uid: true }): Promise<{ source: Buffer } | false>;
  messageFlagsAdd(uid: number, flags: string[], opts: { uid: true }): Promise<unknown>;
  logout(): Promise<unknown>;
};

function messageHash(messageId: string, env: NodeJS.ProcessEnv): string {
  const secret = env.SESSION_SECRET || "udc-email-live-inbound";
  return createHmac("sha256", secret).update(messageId).digest("hex");
}

type ParsedMail = {
  messageId?: string;
  references?: string[] | string;
  from?: { value: Array<{ address?: string }> };
  to?: { value: Array<{ address?: string }> };
  cc?: { value: Array<{ address?: string }> };
  replyTo?: { value: Array<{ address?: string }> };
  subject?: string;
  text?: string;
  date?: Date;
  headers?: Map<string, unknown>;
  attachments?: Array<{ contentId?: string; filename?: string; contentType?: string; content: Buffer }>;
};

/** Build the relay event from a parsed email. Returns null when the message
 *  cannot yield a usable sender + body. Exported for tests. */
export function liveEmailToEvent(uid: number, parsed: ParsedMail): EmailEvidence | null {
  const from = parsed.from?.value?.[0]?.address;
  const text = (parsed.text ?? "").trim();
  if (!from || !text) return null;
  const messageId = (parsed.messageId || `imap-${uid}`).trim();
  const references = parsed.references;
  const firstRef = Array.isArray(references) ? references[0] : references;
  const header = (name: string) => String(parsed.headers?.get(name) ?? "").toLowerCase();
  const autoSubmitted = header("auto-submitted") !== "" && header("auto-submitted") !== "no";
  const precedence = header("precedence");
  const bulk = ["bulk", "list", "junk"].includes(precedence) || header("list-id") !== "";
  return {
    eventId: `imap-${uid}`,
    messageId,
    threadId: (firstRef || messageId).trim(),
    from,
    to: (parsed.to?.value ?? []).map((v) => v.address ?? "").filter(Boolean),
    cc: (parsed.cc?.value ?? []).map((v) => v.address ?? "").filter(Boolean),
    replyTo: parsed.replyTo?.value?.[0]?.address || undefined,
    subject: (parsed.subject ?? "").slice(0, 180),
    text: text.slice(0, 6000),
    autoSubmitted,
    bulk,
    attachments: (parsed.attachments ?? []).map((a, i) => ({
      id: a.contentId || `att-${uid}-${i}`,
      name: a.filename || "document",
      type: a.contentType || "application/octet-stream",
      bytes: a.content.length,
      contentB64: a.content.toString("base64"),
    })),
  };
}

/** One poll cycle. Exported for tests; every dependency is injected. */
export async function pollLiveEmailInbox(
  ports: LiveEmailInboundPorts,
  env: NodeJS.ProcessEnv = process.env,
  parse: (source: Buffer) => Promise<ParsedMail>,
): Promise<{ seen: number; held: number; ignored: number; errors: number }> {
  const client = await ports.connect();
  let seen = 0;
  let held = 0;
  let ignored = 0;
  let errors = 0;
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = (await client.search({ seen: false })).slice(0, MAX_PER_CYCLE);
      for (const uid of uids) {
        try {
          const fetched = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!fetched) continue;
          const parsed = await parse(fetched.source);
          const event = liveEmailToEvent(uid, parsed);
          const hash = messageHash(event?.messageId ?? `imap-${uid}`, env);
          const prior = await ports.claimLookup(hash);
          if (prior?.state === "processed") {
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
            continue;
          }
          if (!prior) {
            await ports.claimInsert(hash, {
              messageHash: hash,
              state: "processing",
              from: event?.from ?? "unknown",
              subject: event?.subject ?? "",
              messageId: event?.messageId ?? `imap-${uid}`,
              references: event ? [event.threadId] : [],
            });
          }
          let state = "processed";
          const ignoreReason = event ? quarantinedSenderReason(env, event.from) ?? bulkMailReason(parsed, event.from) : null;
          if (ignoreReason) {
            ignored += 1;
            state = `ignored_${ignoreReason}`;
          } else if (event) {
            const status = await receiveLiveEmailRelay(event, ports, env);
            if (status === "disabled" || status === "invalid") state = "failed";
            else if (status === "held_for_human_relay" || status === "held_attachment_store_failed") held += 1;
          }
          await ports.claimUpdate(hash, state);
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          seen += 1;
        } catch {
          errors += 1;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { seen, held, ignored, errors };
}

/** Production ports: real IMAP + audit_logs claims + protected store. */
function livePorts(env: NodeJS.ProcessEnv): LiveEmailInboundPorts {
  return {
    connect: async () => {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: env.UDC_EMAIL_IMAP_HOST || "imap.titan.email",
        port: Number(env.UDC_EMAIL_IMAP_PORT || 993),
        secure: env.UDC_EMAIL_IMAP_SECURE !== "false",
        auth: {
          user: env.UDC_EMAIL_IMAP_USER || EMAIL_RELAY_MAILBOX,
          pass: env.UDC_EMAIL_IMAP_PASS!,
        },
        logger: false,
        socketTimeout: 30_000,
      });
      await client.connect();
      return client as unknown as LiveImapClient;
    },
    claimLookup: async (hash) => {
      const { and, eq, sql } = await import("drizzle-orm");
      const { db, auditLogsTable } = await import("@workspace/db");
      const [row] = await db
        .select({ metadata: auditLogsTable.metadata })
        .from(auditLogsTable)
        .where(and(eq(auditLogsTable.action, "email_live_claim"), sql`${auditLogsTable.metadata}->>'messageHash' = ${hash}`))
        .limit(1);
      return row ? { state: String(row.metadata?.state ?? ""), meta: row.metadata as Record<string, unknown> } : null;
    },
    claimInsert: async (hash, meta) => {
      const { db, auditLogsTable } = await import("@workspace/db");
      await db.insert(auditLogsTable).values({ action: "email_live_claim", entityType: "email_live", metadata: meta });
    },
    claimUpdate: async (hash, state) => {
      const { sql } = await import("drizzle-orm");
      const { db } = await import("@workspace/db");
      await db.execute(sql`update audit_logs set metadata = metadata || ${JSON.stringify({ state })}::jsonb where action = 'email_live_claim' and metadata->>'messageHash' = ${hash}`);
    },
    resolveAccount: async (address) => {
      const { emailAccount } = await import("./emailAccount.ts");
      const account = emailAccount();
      const p = account ? await account.repository.resolve(address) : null;
      return p ? { role: p.role, status: p.status, verified: p.status === "verified" } : null;
    },
    storeEmailAttachments: (input) => storeConfidentialEmailAttachments(input),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startEmailLiveInboundRunner(env: NodeJS.ProcessEnv = process.env): void {
  if (!liveEmailRelayEnabled(env) || timer) return;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const { simpleParser } = await import("mailparser");
      // Counts only: never the password, addresses' contents, or bodies.
      const { logger } = await import("../lib/logger.ts");
      const result = await pollLiveEmailInbox(livePorts(env), env, (source) => simpleParser(source) as Promise<ParsedMail>);
      logger.info({ emailLiveInbound: true, ...result }, "email live inbound poll");
    } catch (err) {
      // A failed cycle (mailbox down, password wrong) never crashes the
      // service; the next cycle retries and unseen mail stays unread. The
      // error name only, never message text that could carry credentials.
      const { logger } = await import("../lib/logger.ts");
      logger.warn({ emailLiveInbound: true, errorName: (err as Error)?.name ?? "unknown" }, "email live inbound poll failed");
    } finally {
      busy = false;
    }
  };
  void run();
  timer = setInterval(() => void run(), POLL_MS);
  timer.unref();
}
