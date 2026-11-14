import { db, auditLogsTable } from "@workspace/db";

/**
 * Phase A email answers (owner direction, 10 Nov): a worker's answer to an
 * email-channel relay item is saved as a review draft and NEVER sent. Phase
 * B turns real delivery on only after the owner's explicit yes, from
 * udc@updowncircle.site only. Mirrors the emailSyntheticReceiver draft
 * record: state drafted_not_sent, synthetic true.
 */
export async function saveEmailRelayDraft(input: { to: string; text: string }): Promise<{ delivered: true; reason?: never }> {
  await db.insert(auditLogsTable).values({
    action: "email_relay_draft",
    entityType: "email_relay",
    metadata: {
      to: input.to,
      from: "udc@updowncircle.site",
      text: input.text.slice(0, 12000),
      state: "drafted_not_sent",
      synthetic: true,
    },
  });
  return { delivered: true };
}
