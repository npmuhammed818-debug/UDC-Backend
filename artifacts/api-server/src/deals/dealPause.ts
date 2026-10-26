import { and, eq } from "drizzle-orm";
import { db, dealsTable, auditLogsTable, notificationsTable, usersTable } from "@workspace/db";
import { sendWhatsAppText } from "../whatsapp/client.ts";

import { requestedDealPause, dealPauseContextKind, dealPausePrompt, pausedNoticeToOther, closedNoticeToOther, pausedConfirmationToSender, closedConfirmationToSender, type DealPauseKind } from "./dealPauseText.ts";
export { requestedDealPause, dealPauseContextKind, dealPausePrompt, pausedNoticeToOther, closedNoticeToOther, pausedConfirmationToSender, closedConfirmationToSender };
export type { DealPauseKind };

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
