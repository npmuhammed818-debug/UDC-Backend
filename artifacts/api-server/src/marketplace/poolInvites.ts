import { eq, sql } from "drizzle-orm";
import { auditLogsTable, buyerPoolAllocationsTable, buyerPoolsTable, db, usersTable } from "@workspace/db";
import { sendWhatsAppInteractive } from "../whatsapp/client";

export class PoolAllocationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

// Invite expiry is a config value. Default 10 days, set by the owner (WhatsApp Oct 25 evening).
export function poolInviteExpiryDays(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env["UDC_POOL_INVITE_EXPIRY_DAYS"]);
  return Number.isFinite(n) && n > 0 && n <= 90 ? n : 10;
}
export function inviteExpiresAt(createdAt: Date, days = poolInviteExpiryDays()): Date {
  return new Date(createdAt.getTime() + days * 86_400_000);
}
export function isInviteExpired(createdAt: Date, now = new Date(), days = poolInviteExpiryDays()): boolean {
  return now.getTime() >= inviteExpiresAt(createdAt, days).getTime();
}




export async function respondToPoolInvite(userId: string, allocationId: string, decision: "accepted" | "declined") {
    return await db.transaction(async (tx) => {
      const [alloc] = await tx.select().from(buyerPoolAllocationsTable)
        .where(eq(buyerPoolAllocationsTable.id, allocationId)).limit(1).for("update");
      // Another buyer's invite looks the same as a missing one.
      if (!alloc || alloc.buyerUserId !== userId) throw new PoolAllocationError(404, "invite_not_found");
      const [pool] = await tx.select().from(buyerPoolsTable).where(eq(buyerPoolsTable.id, alloc.poolId)).limit(1).for("update");
      if (!pool) throw new PoolAllocationError(404, "invite_not_found");
      if (alloc.status !== "invited") throw new PoolAllocationError(409, `invite_already_${alloc.status}`);
      if (isInviteExpired(alloc.createdAt)) {
        await tx.update(buyerPoolAllocationsTable).set({ status: "expired" }).where(eq(buyerPoolAllocationsTable.id, alloc.id));
        await tx.insert(auditLogsTable).values({ actorUserId: userId, action: "buyer_pool_invite_expired",
          entityType: "buyer_pool", entityId: pool.id, metadata: { allocationId } });
        return { expired: true as const };
      }
      if (pool.status !== "forming") throw new PoolAllocationError(409, "buyer_pool_not_forming");
      await tx.update(buyerPoolAllocationsTable).set({ status: decision }).where(eq(buyerPoolAllocationsTable.id, alloc.id));
      // Fully accepted = every live invite accepted and the accepted quantity exactly fills the target.
      const [roll] = await tx.select({
        open: sql<number>`count(*) filter (where ${buyerPoolAllocationsTable.status} = 'invited')::int`,
        accepted: sql<string>`coalesce(sum(${buyerPoolAllocationsTable.quantity}) filter (where ${buyerPoolAllocationsTable.status} = 'accepted'), 0)::text`,
        fills: sql<boolean>`coalesce(sum(${buyerPoolAllocationsTable.quantity}) filter (where ${buyerPoolAllocationsTable.status} = 'accepted'), 0) = ${pool.targetQuantity}::numeric`,
      }).from(buyerPoolAllocationsTable).where(eq(buyerPoolAllocationsTable.poolId, pool.id));
      const fullyAccepted = decision === "accepted" && roll!.open === 0 && roll!.fills === true;
      if (fullyAccepted) {
        // Only the buyers' yes is recorded. No bank instrument or payment state changes here.
        await tx.update(buyerPoolsTable).set({ status: "fully_accepted" }).where(eq(buyerPoolsTable.id, pool.id));
      }
      await tx.insert(auditLogsTable).values({ actorUserId: userId,
        action: decision === "accepted" ? "buyer_pool_invite_accepted" : "buyer_pool_invite_declined",
        entityType: "buyer_pool", entityId: pool.id, metadata: { allocationId, fullyAccepted } });
      return { expired: false as const, fullyAccepted, poolStatus: fullyAccepted ? "fully_accepted" : pool.status };
    });
}

// Buyer-facing invite with Accept/Decline buttons. Best effort: the invite already exists in the database,
// so a send failure (or WhatsApp not configured) never blocks or rolls back the admin action.
export async function sendPoolInviteMessage(buyerUserId: string, allocationId: string, summary: { quantity: string; unit: string; days?: number }) {
  try {
    const [buyer] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, buyerUserId)).limit(1);
    if (!buyer?.phone) return false;
    const days = summary.days ?? poolInviteExpiryDays();
    await sendWhatsAppInteractive(buyer.phone, { type: "button",
      body: { text: `UDC invites you to join a buyer pool for ${summary.quantity} ${summary.unit}. The pool goes ahead only if every buyer accepts. Declining is free. This invite closes in ${days} days.` },
      action: { buttons: [["accept", "Accept"], ["decline", "Decline"]].map(([a, title]) => ({ type: "reply" as const, reply: { id: `udc:pool:${a}:${allocationId}`, title } })) } });
    return true;
  } catch { return false; }
}

export function poolReplyText(result: { expired: boolean; fullyAccepted?: boolean }, decision: "accepted" | "declined") {
  if (result.expired) return "This pool invite has expired. UDC can send a new one if you are still interested.";
  if (decision === "declined") return "Done. You declined this pool invite. No cost, no obligation.";
  return result.fullyAccepted
    ? "Accepted. Every buyer has now accepted, so the pool can go ahead. UDC will contact you about the next step."
    : "Accepted. The pool goes ahead only once every invited buyer accepts. UDC will update you.";
}
