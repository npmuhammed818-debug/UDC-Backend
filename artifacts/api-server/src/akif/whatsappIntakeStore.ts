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

  // An intake draft is a live conversation for a day, not forever (owner
  // report, 10 Nov: an 8-day-old draft silently bypassed the human relay and
  // routed every later message to the legacy guidance chain). Stale drafts
  // stop suppressing the relay and the scripted intake; the row stays so a
  // fresh message can still pick the details up.
  const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
  const stale = !Number.isFinite(updatedAt.getTime()) || Date.now() - updatedAt.getTime() > INTAKE_DRAFT_TTL_MS;

  return { ...row, stale };
}

export const INTAKE_DRAFT_TTL_MS = 24 * 60 * 60_000;

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
