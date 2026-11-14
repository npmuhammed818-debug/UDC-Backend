import { isMutedPhone } from "./mutedInbound.ts";
import { HOLDING_REPLY, digits, inviteOnlyOn, isAllowedPhone } from "./inviteRules.ts";

// Owner rule (14 Nov): invite-only mode. When UDC_INVITE_ONLY=on, only numbers in
// UDC_ALLOWED_PHONES (digits, comma separated) get real service. Everyone else
// gets one holding reply, then silence. Muted numbers always get silence.
export type GateDeps = {
  seen: (key: string) => Promise<boolean>;
  mark: (key: string) => Promise<void>;
  send: (phone: string, text: string) => Promise<unknown>;
};

async function defaultDeps(): Promise<GateDeps> {
  const { eq } = await import("drizzle-orm");
  const { sendWhatsAppText } = await import("./client");
  const dbm = (await import("@workspace/db")) as any;
  const db = dbm.db; const sessions = dbm.whatsappChatSessionsTable;
  return {
    seen: async (key) => { const [row] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.phoneHash, key)).limit(1); return Boolean(row); },
    mark: async (key) => { await db.insert(sessions).values({ phoneHash: key, purpose: "invite_hold", step: 0, data: {} as never, lastMessageId: null, expiresAt: new Date(Date.now() + 365 * 86400_000), updatedAt: new Date() }).onConflictDoNothing(); },
    send: sendWhatsAppText,
  };
}

/** true = the gate handled this inbound (no further processing). Allowed numbers return false. Muted numbers are handled by the caller before this runs, but are also refused service here. */
export async function inviteGateHandles(phone: string | undefined, log: { warn: (o: object, m: string) => void }, deps?: GateDeps, env = process.env): Promise<boolean> {
  if (!inviteOnlyOn(env) || !phone) return false;
  if (isAllowedPhone(phone, env) && !isMutedPhone(phone)) return false;
  if (isMutedPhone(phone)) return true;
  const key = "invitehold:" + digits(phone);
  const d = deps ?? await defaultDeps();
  let first = false;
  try {
    if (!(await d.seen(key))) { first = true; await d.mark(key); }
  } catch {
    log.warn({ flow: "invite_gate", reason: "state_unavailable" }, "invite gate state unavailable; staying silent");
    return true;
  }
  if (first) {
    try { await d.send(phone, HOLDING_REPLY); } catch { log.warn({ flow: "invite_gate", reason: "send_failed" }, "holding reply failed"); }
  }
  log.warn({ flow: "invite_gate", phoneTail: digits(phone).slice(-4), holdingSent: first }, "invite_only_hold");
  return true;
}
