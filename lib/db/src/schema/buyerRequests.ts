import { createInsertSchema } from "drizzle-zod";
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const buyerRequestsTable = pgTable(
  "buyer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => usersTable.id),
    companyId: uuid("company_id").references(() => companiesTable.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id),
    targetPrice: numeric("target_price", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unit: text("unit").notNull(),
    destination: text("destination").notNull(),
    preferredIncoterm: text("preferred_incoterm"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("buyer_requests_buyer_user_id_idx").on(table.buyerUserId),
    index("buyer_requests_company_id_idx").on(table.companyId),
    index("buyer_requests_product_id_idx").on(table.productId),
    index("buyer_requests_status_idx").on(table.status),
    index("buyer_requests_destination_idx").on(table.destination),
  ],
);

export const insertBuyerRequestSchema = createInsertSchema(
  buyerRequestsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBuyerRequest = z.infer<typeof insertBuyerRequestSchema>;
export type BuyerRequest = typeof buyerRequestsTable.$inferSelect;