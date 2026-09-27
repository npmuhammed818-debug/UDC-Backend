import { eq } from "drizzle-orm";
import { db, whatsappIntakeDraftsTable, type WhatsAppIntakeDraftPayload } from "@workspace/db";

export type IntakeRole = "buyer" | "seller";

export async function loadWhatsAppIntakeDraft(phone: string) {
  const [row] = await db
    .select()
    .from(whatsappIntakeDraftsTable)
    .where(eq(whatsappIntakeDraftsTable.phone, phone))
    .limit(1);

  if (!row) return null;

  const stale = Date.now() - row.updatedAt.getTime() > 72 * 60 * 60 * 1000;
  if (stale) {
    return {
      ...row,
      draft: {} as WhatsAppIntakeDraftPayload,
      stale: true,
    };
  }

  return { ...row, stale: false };
}

export async function saveWhatsAppIntakeDraft(input: {
  phone: string;
  role: IntakeRole;
  fullName?: string;
  draft: WhatsAppIntakeDraftPayload;
  providerMessageId?: string;
}) {
  await db
    .insert(whatsappIntakeDraftsTable)
    .values({
      phone: input.phone,
      role: input.role,
      fullName: input.fullName,
      draft: input.draft,
      lastProviderMessageId: input.providerMessageId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappIntakeDraftsTable.phone,
      set: {
        role: input.role,
        fullName: input.fullName,
        draft: input.draft,
        lastProviderMessageId: input.providerMessageId,
        updatedAt: new Date(),
      },
    });
}

export async function clearWhatsAppIntakeDraft(input: {
  phone: string;
  role: IntakeRole;
  fullName?: string;
  providerMessageId?: string;
}) {
  await saveWhatsAppIntakeDraft({
    ...input,
    draft: {},
  });
}
