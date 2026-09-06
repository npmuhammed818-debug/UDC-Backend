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

export const sellerListingsTable = pgTable(
  "seller_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => usersTable.id),
    companyId: uuid("company_id")
      .references(() => companiesTable.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unit: text("unit").notNull(),
    price: numeric("price", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    incoterm: text("incoterm"),
    originCountry: text("origin_country"),
    destination: text("destination"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("seller_listings_seller_user_id_idx").on(table.sellerUserId),
    index("seller_listings_company_id_idx").on(table.companyId),
    index("seller_listings_product_id_idx").on(table.productId),
    index("seller_listings_status_idx").on(table.status),
    index("seller_listings_origin_country_idx").on(table.originCountry),
  ],
);

export const insertSellerListingSchema = createInsertSchema(
  sellerListingsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSellerListing = z.infer<typeof insertSellerListingSchema>;
export type SellerListing = typeof sellerListingsTable.$inferSelect;