import { eq } from "drizzle-orm";
import { sendWhatsAppText } from "./client";
import { isMutedPhone } from "./mutedInbound";
import { HOLDING_REPLY, digits, inviteOnlyOn, isAllowedPhone } from "./inviteRules";

// Owner rule (14 Nov): invite-only mode. When UDC_INVITE_ONLY=on, only numbers in
// UDC_ALLOWED_PHONES (digits, comma separated) get real service. Everyone else
// gets one holding reply, then silence. Muted numbers always get silence.
/** true = the gate handled this inbound (no further processing). */
export async function inviteGateHandles(phone: string | undefined, log: { warn: (o: object, m: string) => void }): Promise<boolean> {
  if (!inviteOnlyOn() || !phone) return false;
  if (isMutedPhone(phone) || isAllowedPhone(phone)) return false; // muted handled by caller
  const dbm = (await import("@workspace/db")) as any;
  const db = dbm.db; const sessions = dbm.whatsappChatSessionsTable;
  const key = "invitehold:" + digits(phone);
  let first = false;
  try {
    const [row] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.phoneHash, key)).limit(1);
    if (!row) {
      first = true;
      await db.insert(sessions).values({ phoneHash: key, purpose: "invite_hold", step: 0, data: {} as never, lastMessageId: null, expiresAt: new Date(Date.now() + 365 * 86400_000), updatedAt: new Date() }).onConflictDoNothing();
    }
  } catch {
    log.warn({ flow: "invite_gate", reason: "state_unavailable" }, "invite gate state unavailable; staying silent");
    return true;
  }
  if (first) {
    try { await sendWhatsAppText(phone, HOLDING_REPLY); } catch { log.warn({ flow: "invite_gate", reason: "send_failed" }, "holding reply failed"); }
  }
  log.warn({ flow: "invite_gate", phoneTail: digits(phone).slice(-4), holdingSent: first }, "invite_only_hold");
  return true;
}
