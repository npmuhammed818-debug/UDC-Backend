import { EMAIL_RELAY_MAILBOX } from "./emailRelayChannel.ts";
import { buildRelayEmailPayload, sendRelayEmail, smtpConfigFromEnv, type EmailThreadContext, type SendMailFn, type SmtpConfig } from "./emailOutbound.ts";
// saveEmailRelayDraft is imported lazily in recordDraft so unit tests never load the db layer.

/**
 * Auto-send for email answers (owner direction, 10 Nov, "same as WhatsApp"):
 * a worker's answer to an inbound customer email is sent immediately from
 * udc@updowncircle.site as a threaded reply to that sender only. No preview,
 * no question to him. The bulk/vendor filter already keeps machine mail out
 * of the worker queue; only mail that passed it can be claimed and answered.
 *
 * Safety gate: auto-send only fires for an address with a live intake claim
 * (the live poller's audit row). Without one the item came from a synthetic
 * fixture, so the answer falls back to a stored draft and nothing real goes
 * out.
 */

export type EmailRelaySendPorts = {
  findLatestLiveThread(from: string): Promise<EmailThreadContext | null>;
  recordSent(input: { to: string; text: string; messageId: string }): Promise<void>;
  recordDraft(input: { to: string; text: string }): Promise<void>;
};

export function emailRelaySendDbPorts(): EmailRelaySendPorts {
  return {
    async findLatestLiveThread(from) {
      const { desc, sql } = await import("drizzle-orm");
      const { db, auditLogsTable } = await import("@workspace/db");
      const [claim] = await db
        .select({ metadata: auditLogsTable.metadata })
        .from(auditLogsTable)
        .where(sql`${auditLogsTable.action} = 'email_live_claim' and ${auditLogsTable.metadata}->>'from' = ${from}`)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(1);
      if (!claim) return null;
      return {
        subject: typeof claim.metadata?.subject === "string" ? claim.metadata.subject : undefined,
        messageId: typeof claim.metadata?.messageId === "string" ? claim.metadata.messageId : undefined,
        references: Array.isArray(claim.metadata?.references) ? claim.metadata.references.filter((v): v is string => typeof v === "string") : undefined,
      };
    },
    async recordSent(input) {
      const { db, auditLogsTable } = await import("@workspace/db");
      await db.insert(auditLogsTable).values({
        action: "email_relay_sent",
        entityType: "email_relay",
        metadata: {
          to: input.to,
          from: EMAIL_RELAY_MAILBOX,
          text: input.text.slice(0, 12000),
          state: "sent",
          sentAt: new Date().toISOString(),
          messageId: input.messageId,
        },
      });
    },
    async recordDraft(input) {
      const { saveEmailRelayDraft } = await import("./emailRelayDraftStore.ts");
      await saveEmailRelayDraft(input);
    },
  };
}

export async function sendEmailRelayAnswer(
  input: { to: string; text: string },
  ports: EmailRelaySendPorts,
  deps: { config: SmtpConfig | null; sendMail?: SendMailFn },
): Promise<{ delivered: boolean; reason?: string }> {
  const thread = await ports.findLatestLiveThread(input.to);
  if (!thread) {
    // No live intake for this address: synthetic fixture. Draft only.
    await ports.recordDraft(input);
    return { delivered: true };
  }
  try {
    const payload = buildRelayEmailPayload({ to: input.to, text: input.text }, thread);
    const { id } = await sendRelayEmail(payload, deps);
    await ports.recordSent({ to: input.to, text: input.text, messageId: id });
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: (err instanceof Error ? err.message : "send_failed").slice(0, 140) };
  }
}

export function emailRelaySendDepsFromEnv(env: NodeJS.ProcessEnv = process.env): { config: SmtpConfig | null } {
  return { config: smtpConfigFromEnv(env) };
}
