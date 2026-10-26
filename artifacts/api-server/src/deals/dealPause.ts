import { and, eq } from "drizzle-orm";
import { db, dealsTable, auditLogsTable, notificationsTable, usersTable } from "@workspace/db";
import { sendWhatsAppText } from "../whatsapp/client.ts";

export type DealPauseKind = "pause" | "close";

// Explicit commands only. Mentions and questions never pause a deal.
export function requestedDealPause(text: string): { kind: DealPauseKind; confirmed: boolean } | null {
  const n = text.trim().replace(/[.!]+$/, "").trim();
  const confirm = n.match(/^confirm (pause|close) deal$/i);
  const ask = n.match(/^(?:please\s+)?(pause|close)\s+(?:this\s+|the\s+)?deal$/i);
  const m = confirm ?? ask;
  return m ? { kind: m[1]!.toLowerCase() as DealPauseKind, confirmed: Boolean(confirm) } : null;
}
export const dealPauseContextKind = (kind: DealPauseKind) => `deal_${kind}_confirm`;

export const dealPausePrompt = (kind: DealPauseKind, dealNumber: string) => kind === "pause"
  ? `Pause deal ${dealNumber}? The other side will be told it is paused. No reason is shared. Reply with the exact words CONFIRM PAUSE DEAL to confirm, or ignore this message.`
  : `Close deal ${dealNumber}? The other side will be told it is closed. No reason is shared. Reply with the exact words CONFIRM CLOSE DEAL to confirm, or ignore this message.`;
// Neutral wording: no blame, no reason, no name, no company.
export const pausedNoticeToOther = (dealNumber: string) => `Deal ${dealNumber} is paused. No action is needed from you right now. UDC will message you if it restarts.`;
export const closedNoticeToOther = (dealNumber: string) => `Deal ${dealNumber} has been closed. Thank you for your time. You can post a new requirement or offer any time.`;
export const pausedConfirmationToSender = (dealNumber: string, told: boolean) => `Done. Deal ${dealNumber} is paused. ${told ? "The other side was told." : "The other side will see it in the app."} UDC admin can restart it.`;
export const closedConfirmationToSender = (dealNumber: string, told: boolean) => `Done. Deal ${dealNumber} is closed. ${told ? "The other side was told." : "The other side will see it in the app."}`;

const FINAL = ["completed", "cancelled", "rejected", "on_hold", "disputed"];

export async function applyDealPause(input: { dealId: string; dealNumber: string; senderId: string; receiverId: string; kind: DealPauseKind }) {
  const status = input.kind === "pause" ? "on_hold" : "cancelled";
  const [current] = await db.select({ status: dealsTable.status }).from(dealsTable).where(eq(dealsTable.id, input.dealId)).limit(1);
  if (!current || FINAL.includes(current.status)) return { applied: false as const, told: false };
  // Optimistic: only change the row if the status is still what we read.
  const [updated] = await db.update(dealsTable).set({ status, updatedAt: new Date() })
    .where(and(eq(dealsTable.id, input.dealId), eq(dealsTable.status, current.status))).returning({ id: dealsTable.id });
  if (!updated) return { applied: false as const, told: false };
  await db.insert(auditLogsTable).values({ actorUserId: input.senderId, action: input.kind === "pause" ? "deal_paused_by_party" : "deal_closed_by_party",
    entityType: "deal", entityId: input.dealId, metadata: { newStatus: status, channel: "whatsapp", reasonShared: false } });
  const body = input.kind === "pause" ? pausedNoticeToOther(input.dealNumber) : closedNoticeToOther(input.dealNumber);
  // The other side only: the party who acted is not notified, and no identity or reason is included.
  await db.insert(notificationsTable).values({ userId: input.receiverId, type: "deal_status_updated", title: input.kind === "pause" ? "Deal paused" : "Deal closed", body, link: `/deals/${input.dealId}` });
  let told = false;
  try {
    const [receiver] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, input.receiverId)).limit(1);
    if (receiver?.phone) told = (await sendWhatsAppText(receiver.phone, body)).delivered === true;
  } catch { /* the in-app notice is already saved; a WhatsApp failure never undoes the pause */ }
  return { applied: true as const, told };
}
