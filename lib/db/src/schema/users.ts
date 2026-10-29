import { createInsertSchema } from "drizzle-zod";
import {
  index,
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    phone: text("phone"),
    fullName: text("full_name"),
    passwordHash: text("password_hash").notNull(),
    passwordRecoveryEnabled: boolean("password_recovery_enabled").notNull().default(false),
    verifiedEmail: text("verified_email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    role: text("role").notNull().default("buyer"),
    status: text("status").notNull().default("pending"),
    country: text("country"),
    akifLearningOptIn: boolean("akif_learning_opt_in").notNull().default(false),
    userType: text("user_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_unique").on(table.phone),
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordRecoveryEnabled: true,
  verifiedEmail: true,
  emailVerifiedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
