import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

// Voice-reply notice and text-only opt-out. Keyed by a SHA-256 of the phone; no number, text or audio is stored.
export const whatsappVoicePreferencesTable = pgTable("whatsapp_voice_preferences", {
  phoneHash: text("phone_hash").primaryKey(),
  noticeSentAt: timestamp("notice_sent_at", { withTimezone: true }),
  textOnly: boolean("text_only").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
