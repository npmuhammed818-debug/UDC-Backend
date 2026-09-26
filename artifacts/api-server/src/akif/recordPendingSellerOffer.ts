import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, productsTable, sellerListingsTable, usersTable } from "@workspace/db";
import { hashPassword } from "../auth/passwords";

export const sellerOfferSchema = z.object({
  phone: z.string().min(7).max(32),
  fullName: z.string().min(2).max(120),
  product: z.string().min(2).max(120),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(24).default("MT"),
  price: z.coerce.number().positive(),
  currency: z.string().length(3).default("USD"),
  originCountry: z.string().min(2).max(120).optional(),
  destination: z.string().min(2).max(120).optional(),
  incoterm: z.string().min(2).max(12).optional(),
});

export async function recordPendingSellerOffer(input: z.infer<typeof sellerOfferSchema>) {
  const [seller] = await db.insert(usersTable).values({
    phone: input.phone, fullName: input.fullName, role: "seller", status: "pending",
    passwordHash: await hashPassword(randomUUID()),
  }).onConflictDoUpdate({ target: usersTable.phone, set: { fullName: input.fullName, updatedAt: new Date() } }).returning();

  const existing = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.name, input.product)).limit(1);
  const [product] = existing.length ? existing : await db.insert(productsTable).values({ name: input.product, category: "commodity" }).returning({ id: productsTable.id });

  const [offer] = await db.insert(sellerListingsTable).values({
    sellerUserId: seller.id, productId: product.id, quantity: String(input.quantity), unit: input.unit,
    price: String(input.price), currency: input.currency.toUpperCase(), originCountry: input.originCountry,
    destination: input.destination, incoterm: input.incoterm, status: "pending_admin_review",
  }).returning({ id: sellerListingsTable.id, status: sellerListingsTable.status });

  return offer;
}
