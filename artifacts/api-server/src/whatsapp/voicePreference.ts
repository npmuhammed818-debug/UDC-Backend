import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, whatsappVoicePreferencesTable as prefs } from "@workspace/db";

export { VOICE_NOTICE, TEXT_ONLY_CONFIRMATION, VOICE_ON_CONFIRMATION, parseVoiceCommand, type VoiceCommand } from "../akif/voiceConsent.ts";
import { VOICE_NOTICE } from "../akif/voiceConsent.ts";

export const hashPhone = (phone: string) => createHash("sha256").update("wa-voice:" + phone).digest("hex");

export type VoiceState = "voice" | "needs_notice" | "text_only" | "unavailable";

/** Fails closed: any error, including a missing table, means text only. */
export async function getVoiceState(phone: string): Promise<VoiceState> {
  try {
    const [row] = await db.select({ noticeSentAt: prefs.noticeSentAt, textOnly: prefs.textOnly }).from(prefs).where(eq(prefs.phoneHash, hashPhone(phone))).limit(1);
    if (row?.textOnly) return "text_only";
    return row?.noticeSentAt ? "voice" : "needs_notice";
  } catch { return "unavailable"; }
}

export async function setTextOnly(phone: string, textOnly: boolean): Promise<boolean> {
  try {
    const phoneHash = hashPhone(phone);
    await db.insert(prefs).values({ phoneHash, textOnly, noticeSentAt: textOnly ? null : new Date() })
      .onConflictDoUpdate({ target: prefs.phoneHash, set: textOnly ? { textOnly, updatedAt: new Date() } : { textOnly, noticeSentAt: sql`COALESCE(${prefs.noticeSentAt}, now())`, updatedAt: new Date() } });
    return true;
  } catch { return false; }
}

/** Records that the notice is being shown. Returns false if it could not be saved (then no notice and no voice). */
export async function recordNotice(phone: string): Promise<boolean> {
  try {
    await db.insert(prefs).values({ phoneHash: hashPhone(phone), noticeSentAt: new Date() })
      .onConflictDoUpdate({ target: prefs.phoneHash, set: { noticeSentAt: new Date(), updatedAt: new Date() } });
    return true;
  } catch { return false; }
}
