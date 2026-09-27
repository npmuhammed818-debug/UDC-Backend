import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type WhatsAppIntakeDraftPayload = {
  product?: string;
  quantity?: number;
  unit?: string;
  destination?: string;
  targetPrice?: number;
  price?: number;
  currency?: string;
  incoterm?: string;
  originCountry?: string;
};

export const whatsappIntakeDraftsTable = pgTable(
  "whatsapp_intake_drafts",
  {
    phone: text("phone").primaryKey(),
    role: text("role").notNull(),
    fullName: text("full_name"),
    draft: jsonb("draft").$type<WhatsAppIntakeDraftPayload>().notNull().default({}),
    lastProviderMessageId: text("last_provider_message_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("whatsapp_intake_drafts_updated_at_idx").on(table.updatedAt),
  ],
);
