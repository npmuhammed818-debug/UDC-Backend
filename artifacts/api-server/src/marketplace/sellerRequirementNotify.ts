// Seller-side requirement notifications (owner decision, 28 Oct): when a buyer
// requirement is approved, matching sellers hear the REQUIREMENT ONLY - never
// the buyer's name, company or contact details. A seller's "Interested" creates
// a suggested match that still needs UDC admin review; entering a deal always
// needs verified documents on both sides.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  auditLogsTable, buyerRequestsTable, db, matchesTable, productsTable,
  sellerListingsTable, usersTable,
} from '@workspace/db';
import { sendWhatsAppInteractive, sendWhatsAppText } from '../whatsapp/client';
import {
  MAX_SELLERS_PER_REQUIREMENT, REQUIREMENT_INTEREST_RECORDED, REQUIREMENT_INTEREST_REPEAT,
  REQUIREMENT_INTEREST_UNAVAILABLE, REQUIREMENT_PASS_REPLY, openRequirementsReply, requirementNotifyText,
} from './sellerRequirementText';

export { asksForOpenRequirements } from './sellerRequirementText';

async function alreadyNotified(requestId: string, sellerUserId: string): Promise<boolean> {
  const rows = await db.select({ id: auditLogsTable.id }).from(auditLogsTable).where(and(
    eq(auditLogsTable.action, 'seller_requirement_notified'),
    eq(auditLogsTable.entityId, requestId),
    sql`${auditLogsTable.metadata}->>'sellerUserId' = ${sellerUserId}`,
  )).limit(1);
  return rows.length > 0;
}

export async function notifyMatchingSellers(requestId: string): Promise<number> {
  const [request] = await db.select().from(buyerRequestsTable)
    .where(and(eq(buyerRequestsTable.id, requestId), eq(buyerRequestsTable.status, 'approved'))).limit(1);
  if (!request) return 0;
  const [product] = await db.select({ name: productsTable.name }).from(productsTable)
    .where(eq(productsTable.id, request.productId)).limit(1);
  const listings = await db.select().from(sellerListingsTable)
    .where(and(eq(sellerListingsTable.productId, request.productId), eq(sellerListingsTable.status, 'approved')))
    .orderBy(desc(sellerListingsTable.updatedAt)).limit(50);
  const notifiedSellers = new Set<string>();
  let sent = 0;
  for (const listing of listings) {
    if (sent >= MAX_SELLERS_PER_REQUIREMENT) break;
    if (notifiedSellers.has(listing.sellerUserId)) continue;
    const [seller] = await db.select({ id: usersTable.id, phone: usersTable.phone, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.id, listing.sellerUserId)).limit(1);
    if (!seller?.phone || ['suspended', 'rejected'].includes(seller.status)) continue;
    if (await alreadyNotified(request.id, seller.id)) continue;
    try {
      await sendWhatsAppInteractive(seller.phone, {
        type: 'button',
        body: { text: requirementNotifyText(request, product?.name ?? 'this product') },
        action: { buttons: [['interested', 'Interested'], ['pass', 'Not now']].map(([id, title]) => ({ type: 'reply' as const, reply: { id: `udc:req:${id}:${request.id}`, title } })) },
      });
    } catch { continue; } // No audit record on delivery failure, so the sweep retries later.
    notifiedSellers.add(seller.id);
    await db.insert(auditLogsTable).values({
      actorUserId: seller.id, action: 'seller_requirement_notified',
      entityType: 'buyer_request', entityId: request.id,
      metadata: { sellerUserId: seller.id, sellerListingId: listing.id },
    });
    sent++;
  }
  return sent;
}

export async function respondToRequirementInterest(phone: string, requestId: string, interested: boolean): Promise<void> {
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable)
    .where(eq(usersTable.phone, phone)).limit(1);
  if (!user || user.role !== 'seller') { await sendWhatsAppText(phone, REQUIREMENT_INTEREST_UNAVAILABLE); return; }
  if (!interested) { await sendWhatsAppText(phone, REQUIREMENT_PASS_REPLY); return; }
  const [request] = await db.select({ id: buyerRequestsTable.id, productId: buyerRequestsTable.productId, status: buyerRequestsTable.status })
    .from(buyerRequestsTable).where(eq(buyerRequestsTable.id, requestId)).limit(1);
  if (!request || request.status !== 'approved') { await sendWhatsAppText(phone, REQUIREMENT_INTEREST_UNAVAILABLE); return; }
  const [listing] = await db.select({ id: sellerListingsTable.id }).from(sellerListingsTable)
    .where(and(eq(sellerListingsTable.sellerUserId, user.id), eq(sellerListingsTable.productId, request.productId), eq(sellerListingsTable.status, 'approved')))
    .orderBy(desc(sellerListingsTable.updatedAt)).limit(1);
  if (!listing) { await sendWhatsAppText(phone, REQUIREMENT_INTEREST_UNAVAILABLE); return; }
  const existing = await db.select({ id: matchesTable.id }).from(matchesTable)
    .where(and(eq(matchesTable.buyerRequestId, request.id), eq(matchesTable.sellerListingId, listing.id))).limit(1);
  if (existing.length) { await sendWhatsAppText(phone, REQUIREMENT_INTEREST_REPEAT); return; }
  const id = randomUUID();
  await db.insert(matchesTable).values({ id, buyerRequestId: request.id, sellerListingId: listing.id, status: 'suggested' });
  await db.insert(auditLogsTable).values({
    actorUserId: user.id, action: 'seller_requirement_interest',
    entityType: 'match', entityId: id,
    metadata: { buyerRequestId: request.id, sellerListingId: listing.id, source: 'seller_interested_button' },
  });
  await sendWhatsAppText(phone, REQUIREMENT_INTEREST_RECORDED);
}

export async function openRequirementsReplyForSeller(phone: string): Promise<string | null> {
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable)
    .where(eq(usersTable.phone, phone)).limit(1);
  if (!user || user.role !== 'seller') return null;
  const listings = await db.select({ productId: sellerListingsTable.productId }).from(sellerListingsTable)
    .where(and(eq(sellerListingsTable.sellerUserId, user.id), eq(sellerListingsTable.status, 'approved'))).limit(100);
  if (!listings.length) return 'You have no approved products yet. Send your offer first, and I will tell you when buyers match.';
  const productIds = [...new Set(listings.map((l) => l.productId))];
  const requests = await db.select({ id: buyerRequestsTable.id }).from(buyerRequestsTable)
    .where(and(eq(buyerRequestsTable.status, 'approved'), inArray(buyerRequestsTable.productId, productIds))).limit(100);
  return openRequirementsReply(requests.length);
}
