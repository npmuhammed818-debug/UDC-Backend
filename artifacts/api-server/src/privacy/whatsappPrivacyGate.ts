import { createHmac } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  notificationPreferencesTable,
  usersTable,
} from "@workspace/db";
import {
  decideWhatsAppConsent,
  privacyCommand,
  type WhatsAppPrivacyState,
} from "./whatsappConsent";
import { POLICY_VERSION, SUPPORT_EMAIL } from "./policies";
const policyBase = "https://udc-backend.onrender.com";
export async function whatsappPrivacyGate(
  phone: string,
  text?: string,
): Promise<string | null> {
  const command = privacyCommand(text);
  if (command === "privacy")
    return `Privacy: ${policyBase}/privacy\nTerms: ${policyBase}/terms\nData requests: ${policyBase}/data-deletion`;
  if (command === "deletion")
    return `To request deletion, email ${SUPPORT_EMAIL} from your account email or identify the WhatsApp number you used with UDC. Do not send passwords or bank details. UDC will verify and review the records and explain any required retention. Instructions: ${policyBase}/data-deletion`;
  if (command === "stop") {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);
    if (user)
      await db
        .insert(notificationPreferencesTable)
        .values({
          userId: user.id,
          optionalInApp: false,
          optionalWhatsApp: false,
          reminders: false,
          announcements: false,
        })
        .onConflictDoUpdate({
          target: notificationPreferencesTable.userId,
          set: {
            optionalInApp: false,
            optionalWhatsApp: false,
            reminders: false,
            announcements: false,
            updatedAt: new Date(),
          },
        });
    return `Optional notifications are off for your UDC account, if present. To withdraw consent or request deletion, contact ${SUPPORT_EMAIL}.`;
  }
  // Pseudonymous lookup avoids putting phone numbers or message bodies into consent logs.
  const fingerprint = createHmac("sha256", process.env.WHATSAPP_APP_SECRET!)
    .update(phone)
    .digest("hex");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`whatsapp-consent:${fingerprint}`}))`,
    );
    const [current] = await tx
      .select()
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.entityType, "whatsapp_consent"),
          sql`${auditLogsTable.metadata}->>'fingerprint' = ${fingerprint}`,
        ),
      )
      .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
      .limit(1);
    const decision = decideWhatsAppConsent(
      {
        text,
        state: (current?.metadata?.status as WhatsAppPrivacyState) || "none",
        version: current?.metadata?.policyVersion as string | undefined,
      },
      POLICY_VERSION,
    );
    if (decision === "continue") return null;
    if (decision === "accept") {
      await tx
        .insert(auditLogsTable)
        .values({
          createdAt: sql`clock_timestamp()`,
          action: "whatsapp_consent_recorded",
          entityType: "whatsapp_consent",
          metadata: {
            fingerprint,
            policyVersion: POLICY_VERSION,
            status: "accepted",
            termsAccepted: true,
            adultBusinessUser: true,
          },
        });
      return "Thanks. What trade requirement or offer would you like to discuss?";
    }
    if (
      current?.metadata?.status !== "notice_sent" ||
      current.metadata.policyVersion !== POLICY_VERSION
    ) {
      await tx
        .insert(auditLogsTable)
        .values({
          createdAt: sql`clock_timestamp()`,
          action: "whatsapp_privacy_notice_presented",
          entityType: "whatsapp_consent",
          metadata: {
            fingerprint,
            policyVersion: POLICY_VERSION,
            status: "notice_sent",
          },
        });
    }
    return `Before we start, UDC is for business representatives aged 18 or older. We process your messages and submitted trade documents with Meta and our configured service/AI providers for the trade services you request.\nPrivacy: ${policyBase}/privacy\nTerms and fees: ${policyBase}/terms\nReply AGREE only if you are 18+, authorized to represent your business, accept the terms and acknowledge this processing. Otherwise, do not submit personal information or documents. Optional marketing is not included. For help or data requests: ${SUPPORT_EMAIL}`;
  });
}
