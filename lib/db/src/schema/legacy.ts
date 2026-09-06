import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const buyersTable = pgTable("buyers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id),
  companyName: text("company_name"),
  businessLicense: text("business_license"),
  taxRegistration: text("tax_registration"),
  productsInterested: text("products_interested"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sellersTable = pgTable("sellers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id),
  companyName: text("company_name"),
  sellerType: text("seller_type"),
  products: text("products"),
  monthlyCapacity: numeric("monthly_capacity"),
  certifications: text("certifications"),
  businessLicense: text("business_license"),
  exportCountries: text("export_countries"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentsTable = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id),
  companyName: text("company_name"),
  experience: text("experience"),
  referralCode: text("referral_code"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inquiriesTable = pgTable("inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerId: uuid("buyer_id").references(() => buyersTable.id),
  productId: uuid("product_id"),
  quantity: numeric("quantity"),
  unit: text("unit"),
  targetPrice: numeric("target_price"),
  currency: text("currency").default("USD"),
  incoterm: text("incoterm"),
  destination: text("destination"),
  paymentTerms: text("payment_terms"),
  deliveryTime: text("delivery_time"),
  status: text("status").default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const offersTable = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").references(() => inquiriesTable.id),
  sellerId: uuid("seller_id").references(() => sellersTable.id),
  price: numeric("price"),
  currency: text("currency").default("USD"),
  terms: text("terms"),
  availability: text("availability"),
  deliveryTime: text("delivery_time"),
  status: text("status").default("submitted"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});