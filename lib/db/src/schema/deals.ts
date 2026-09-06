import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { buyerRequestsTable } from "./buyerRequests";
import { productsTable } from "./products";
import { sellerListingsTable } from "./sellerListings";
import { usersTable } from "./users";

export const dealsTable = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealNumber: text("deal_number")
      .notNull()
      .default(
        sql`concat('UDC-', upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))`,
      ),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => usersTable.id),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => usersTable.id),
    buyerRequestId: uuid("buyer_request_id").references(
      () => buyerRequestsTable.id,
    ),
    sellerListingId: uuid("seller_listing_id").references(
      () => sellerListingsTable.id,
    ),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unit: text("unit").notNull(),
    agreedPrice: numeric("agreed_price", {
      precision: 18,
      scale: 2,
    }).notNull(),
    currency: text("currency").notNull().default("USD"),
    incoterm: text("incoterm"),
    destination: text("destination"),
    status: text("status").notNull().default("initiated"),
    // Legacy relationships retained for compatibility with the existing schema.
    inquiryId: uuid("inquiry_id"),
    buyerId: uuid("buyer_id"),
    sellerId: uuid("seller_id"),
    agentId: uuid("agent_id"),
    dealValue: numeric("deal_value", { precision: 18, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("deals_deal_number_unique").on(table.dealNumber),
    index("deals_buyer_user_id_idx").on(table.buyerUserId),
    index("deals_seller_user_id_idx").on(table.sellerUserId),
    index("deals_buyer_request_id_idx").on(table.buyerRequestId),
    index("deals_seller_listing_id_idx").on(table.sellerListingId),
    index("deals_product_id_idx").on(table.productId),
    index("deals_status_idx").on(table.status),
  ],
);

export const insertDealSchema = createInsertSchema(dealsTable).omit({
  id: true,
  dealNumber: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;