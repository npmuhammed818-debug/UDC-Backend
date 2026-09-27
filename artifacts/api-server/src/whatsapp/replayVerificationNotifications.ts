import { and, eq } from "drizzle-orm";
import { db, dealsTable, notificationsTable, productsTable, usersTable } from "@workspace/db";
import { sendWhatsAppText } from "./client";

export async function replayVerificationWhatsAppNotifications() {
  const rawIds = process.env.WHATSAPP_VERIFICATION_REPLAY_USER_IDS?.trim();
  if (!rawIds) return { configured: false as const, sent: 0, failed: 0, skipped: 0 };

  const userIds = [...new Set(rawIds.split(",").map((value) => value.trim()).filter(Boolean))];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

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

    const [alreadySent] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.type, "verification_whatsapp_sent"),
      ))
      .limit(1);

    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      const delivery = await sendWhatsAppText(
        user.phone,
        "UDC verification complete: your test account is now verified.",
      );

      if (!delivery.delivered) {
        failed += 1;
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

  return { configured: true as const, sent, failed, skipped };
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

  for (const user of targets) {
    if (!user.phone) {
      skipped += 1;
      continue;
    }

    const markerType = `deal_status_whatsapp_sent_${deal.id}_${deal.status}`;
    const [alreadySent] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.type, markerType),
      ))
      .limit(1);

    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      const message = `Deal status updated: Deal ${deal.dealNumber} is now ${deal.status}.`;
      const delivery = await sendWhatsAppText(user.phone, message);
      if (!delivery.delivered) {
        failed += 1;
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

  return { configured: true as const, sent, failed, skipped };
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
  const markerType = `deal_summary_whatsapp_sent_${deal.id}`;
  const productName = product?.name ?? "Product";
  const message =
    `UDC Deal ${deal.dealNumber}\n` +
    `Product: ${productName}\n` +
    `Quantity: ${deal.quantity} ${deal.unit}\n` +
    `Price: ${deal.currency} ${deal.agreedPrice} per ${deal.unit}\n` +
    `Total: ${deal.currency} ${deal.dealValue ?? "not calculated"}\n` +
    `Destination: ${deal.destination ?? "not specified"}\n` +
    `Status: ${deal.status}`;

  for (const user of targets) {
    if (!user.phone) {
      skipped += 1;
      continue;
    }

    const [alreadySent] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.type, markerType),
      ))
      .limit(1);

    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      const delivery = await sendWhatsAppText(user.phone, message);
      if (!delivery.delivered) {
        failed += 1;
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

  return { configured: true as const, sent, failed, skipped };
}
