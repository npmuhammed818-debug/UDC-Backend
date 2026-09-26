import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { buyerRequestsTable, db, productsTable, usersTable } from "@workspace/db";
import { hashPassword } from "../auth/passwords";

export const buyerIntakeSchema = z.object({
  phone: z.string().min(7).max(32),
  fullName: z.string().min(2).max(120),
  product: z.string().min(2).max(120).default("Copper scrap"),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(24).default("MT"),
  targetPrice: z.coerce.number().positive().optional(),
  currency: z.string().length(3).default("USD"),
  destination: z.string().min(2).max(120),
  incoterm: z.string().min(2).max(12).optional(),
});

export async function recordPendingBuyerRequirement(input: z.infer<typeof buyerIntakeSchema>) {
  const [buyer] = await db.insert(usersTable).values({
    phone: input.phone, fullName: input.fullName, role: "buyer", status: "pending",
    passwordHash: await hashPassword(randomUUID()),
  }).onConflictDoUpdate({ target: usersTable.phone, set: { fullName: input.fullName, updatedAt: new Date() } }).returning();
  const existing = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.name, input.product)).limit(1);
  const [product] = existing.length ? existing : await db.insert(productsTable).values({ name: input.product, category: "commodity" }).returning({ id: productsTable.id });
  const [requirement] = await db.insert(buyerRequestsTable).values({
    buyerUserId: buyer.id, productId: product.id, quantity: String(input.quantity), unit: input.unit,
    targetPrice: input.targetPrice ? String(input.targetPrice) : undefined, currency: input.currency.toUpperCase(),
    destination: input.destination, preferredIncoterm: input.incoterm, status: "pending_admin_review",
  }).returning({ id: buyerRequestsTable.id, status: buyerRequestsTable.status });
  return requirement;
}
