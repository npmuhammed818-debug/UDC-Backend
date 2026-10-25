import {authorizeCustomerWindow,hasCurrentWhatsAppConsent} from './customerServiceWindow';
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, auditLogsTable, dealsTable, notificationsTable, productsTable, usersTable } from "@workspace/db";
import { sendWhatsAppText, getWhatsAppConfig } from "./client";

// A durable attempt is committed BEFORE calling Meta. Unlike an in-memory
// sent flag, it survives a crash after submission and serializes replicas.
// Never automatically repeat an ambiguous attempt or call it delivered.
async function claimReplay(userId:string,phone:string,markerType:string,link:string,dealId?:string){
  if(!getWhatsAppConfig())return false;
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'legacy-replay:'+userId+':'+markerType}))`);
    const audience=await tx.execute(sql`
      SELECT u.id FROM public.users u JOIN public.notification_preferences p ON p.user_id=u.id
      WHERE u.id=${userId} AND u.phone=${phone} AND u.status='verified'
        AND p.optional_whatsapp=true AND p.reminders=true
        AND (${dealId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM public.deals d WHERE d.id=${dealId??null}::uuid
          AND ((d.buyer_user_id=u.id AND u.role='buyer') OR (d.seller_user_id=u.id AND u.role='seller'))))
    `);
    if(!audience.rows.length||!await hasCurrentWhatsAppConsent(phone,{executor:tx})||
      !await authorizeCustomerWindow(phone,userId,dealId??'',{executor:tx}))return false;
    const [existing]=await tx.select({id:notificationsTable.id}).from(notificationsTable)
      .where(and(eq(notificationsTable.userId,userId),inArray(notificationsTable.type,[markerType,markerType+'_attempted']))).limit(1);
    const [attempt]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable)
      .where(and(eq(auditLogsTable.entityId,userId),eq(auditLogsTable.action,'whatsapp_replay_attempted'),sql`${auditLogsTable.metadata}->>'markerType' = ${markerType}`)).limit(1);
    if(existing||attempt)return false;
    await tx.insert(auditLogsTable).values({actorUserId:userId,action:'whatsapp_replay_attempted',entityType:'user',entityId:userId,
      metadata:{markerType,reference:link,automaticRetryAllowed:false}});
    return true;
  });
}

export async function replayVerificationWhatsAppNotifications() {
  const rawIds = process.env.WHATSAPP_VERIFICATION_REPLAY_USER_IDS?.trim();
  if (!rawIds) return { configured: false as const, sent: 0, failed: 0, skipped: 0 };

  const userIds = [...new Set(rawIds.split(",").map((value) => value.trim()).filter(Boolean))];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let uncertain = 0;

  for (const userId of userIds) {
    const [user] = await db
      .select({ id: usersTable.id, phone: usersTable.phone, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user?.phone || user.status !== "verified") {
      skipped += 1;
      continue;
    }

    if(!await claimReplay(user.id,user.phone,'verification_whatsapp_sent','/profile')){skipped+=1;continue;}

    try {
      const delivery = await sendWhatsAppText(
        user.phone,
        "Your UDC account is verified.",
      );

      if (!delivery.delivered) {
        if(delivery.reason==='provider_outcome_unknown')uncertain+=1;else failed+=1;
        continue;
      }

      await db.insert(notificationsTable).values({
        userId: user.id,
        type: "verification_whatsapp_sent",
        title: "WhatsApp verification update sent",
        body: "WhatsApp verification update sent for status verified.",
        link: "/profile",
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { configured: true as const, sent, failed, skipped, uncertain };
}


export async function replayDealStatusWhatsAppNotification() {
  const dealId = process.env.WHATSAPP_DEAL_STATUS_REPLAY_ID?.trim();
  if (!dealId) return { configured: false as const, sent: 0, failed: 0, skipped: 0 };

  const [deal] = await db
    .select({
      id: dealsTable.id,
      dealNumber: dealsTable.dealNumber,
      status: dealsTable.status,
      buyerUserId: dealsTable.buyerUserId,
      sellerUserId: dealsTable.sellerUserId,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId))
    .limit(1);

  if (!deal) return { configured: true as const, sent: 0, failed: 0, skipped: 1 };

  const counterparties = await db
    .select({ id: usersTable.id, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.status, "verified"));

  const targets = counterparties.filter(
    (user) => user.id === deal.buyerUserId || user.id === deal.sellerUserId,
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let uncertain = 0;

  for (const user of targets) {
    if (!user.phone) {
      skipped += 1;
      continue;
    }

    const markerType = `deal_status_whatsapp_sent_${deal.id}_${deal.status}`;
    if(!await claimReplay(user.id,user.phone,markerType,`/deals/${deal.id}`,deal.id)){skipped+=1;continue;}

    try {
      const message = `We’re at ${deal.status} now.`;
      const delivery = await sendWhatsAppText(user.phone, message);
      if (!delivery.delivered) {
        if(delivery.reason==='provider_outcome_unknown')uncertain+=1;else failed+=1;
        continue;
      }

      await db.insert(notificationsTable).values([
        {
          userId: user.id,
          type: "deal_status_updated",
          title: "Deal status updated",
          body: `Deal ${deal.dealNumber} is now ${deal.status}.`,
          link: `/deals/${deal.id}`,
        },
        {
          userId: user.id,
          type: markerType,
          title: "WhatsApp deal status sent",
          body: `WhatsApp deal status sent for ${deal.status}.`,
          link: `/deals/${deal.id}`,
        },
      ]);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { configured: true as const, sent, failed, skipped, uncertain };
}


export async function replayDealSummaryWhatsAppNotification() {
  const dealId = process.env.WHATSAPP_DEAL_SUMMARY_REPLAY_ID?.trim();
  if (!dealId) return { configured: false as const, sent: 0, failed: 0, skipped: 0 };

  const [deal] = await db
    .select({
      id: dealsTable.id,
      dealNumber: dealsTable.dealNumber,
      productId: dealsTable.productId,
      quantity: dealsTable.quantity,
      unit: dealsTable.unit,
      agreedPrice: dealsTable.agreedPrice,
      currency: dealsTable.currency,
      destination: dealsTable.destination,
      dealValue: dealsTable.dealValue,
      status: dealsTable.status,
      buyerUserId: dealsTable.buyerUserId,
      sellerUserId: dealsTable.sellerUserId,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId))
    .limit(1);

  if (!deal) return { configured: true as const, sent: 0, failed: 0, skipped: 1 };

  const [product] = await db
    .select({ name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.id, deal.productId))
    .limit(1);

  const counterparties = await db
    .select({ id: usersTable.id, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.status, "verified"));

  const targets = counterparties.filter(
    (user) => user.id === deal.buyerUserId || user.id === deal.sellerUserId,
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let uncertain = 0;
  const markerType = `deal_summary_whatsapp_sent_${deal.id}`;
  const productName = product?.name ?? "Product";
  const message =
    `${productName}. ${deal.quantity} ${deal.unit} at ${deal.currency} ${deal.agreedPrice}/${deal.unit}. ` +
    `Destination ${deal.destination ?? "not confirmed yet"}. We’re at ${deal.status} now.`;

  for (const user of targets) {
    if (!user.phone) {
      skipped += 1;
      continue;
    }

    if(!await claimReplay(user.id,user.phone,markerType,`/deals/${deal.id}`,deal.id)){skipped+=1;continue;}

    try {
      const delivery = await sendWhatsAppText(user.phone, message);
      if (!delivery.delivered) {
        if(delivery.reason==='provider_outcome_unknown')uncertain+=1;else failed+=1;
        continue;
      }

      await db.insert(notificationsTable).values({
        userId: user.id,
        type: markerType,
        title: "WhatsApp deal summary sent",
        body: `Deal summary sent for ${deal.dealNumber}.`,
        link: `/deals/${deal.id}`,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { configured: true as const, sent, failed, skipped, uncertain };
}
