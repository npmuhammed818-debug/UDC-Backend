import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const emailAuthChallengesTable = pgTable(
  "email_auth_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("email_auth_user_purpose_idx").on(t.userId, t.purpose),
    index("email_auth_expires_idx").on(t.expiresAt),
    check(
      "email_auth_challenges_purpose_check",
      sql`${t.purpose} in ('verify_email','reset_password')`,
    ),
    check(
      "email_auth_challenges_attempts_check",
      sql`${t.attempts} between 0 and 5`,
    ),
  ],
);

export const emailAuthLimitsTable = pgTable(
  "email_auth_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [
    index("email_auth_limits_window_idx").on(t.windowStart),
    check("email_auth_limits_count_check", sql`${t.count} > 0`),
  ],
);
