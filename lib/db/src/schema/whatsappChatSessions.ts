import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
export const whatsappChatSessionsTable=pgTable('whatsapp_chat_sessions',{
  id:uuid('id').primaryKey().defaultRandom(),
  phoneHash:text('phone_hash').notNull().unique(),
  purpose:text('purpose').notNull(),
  step:integer('step').notNull().default(0),
  data:jsonb('data').$type<Record<string,string>>().notNull().default({}),
  lastMessageId:text('last_message_id'),
  expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},table=>[index('whatsapp_chat_sessions_expiry_idx').on(table.expiresAt)]);
