import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const whatsappSigninChallengesTable = pgTable('whatsapp_signin_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  codeHash: text('code_hash').notNull().unique(),
  browserTokenHash: text('browser_token_hash').notNull().unique(),
  requestedRole: text('requested_role').notNull(),
  linkUserId: uuid('link_user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  approvedUserId: uuid('approved_user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('whatsapp_signin_expires_idx').on(table.expiresAt)]);
