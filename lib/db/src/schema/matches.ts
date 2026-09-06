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
import { buyerRequestsTable } from "./buyerRequests";
import { sellerListingsTable } from "./sellerListings";

export const matchesTable = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerRequestId: uuid("buyer_request_id")
      .notNull()
      .references(() => buyerRequestsTable.id),
    sellerListingId: uuid("seller_listing_id")
      .notNull()
      .references(() => sellerListingsTable.id),
    matchScore: numeric("match_score", { precision: 5, scale: 2 }),
    status: text("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("matches_buyer_request_id_idx").on(table.buyerRequestId),
    index("matches_seller_listing_id_idx").on(table.sellerListingId),
    index("matches_status_idx").on(table.status),
  ],
);

export const insertMatchSchema = createInsertSchema(matchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;