import { and, eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
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
