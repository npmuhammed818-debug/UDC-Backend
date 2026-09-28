import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { buyerRequestsTable, db, productsTable, sellerListingsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../auth/middleware";

const router: IRouter = Router();
const id = z.string().uuid();
const money = z.number().finite().nonnegative();
const quantity = z.number().finite().positive();
const text = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(160).transform((value) => value || undefined).optional();

const productInput = z.object({
  name: text,
  category: optionalText,
  hs_code: z.string().trim().max(20).transform((value) => value || undefined).optional(),
  description: z.string().trim().max(2000).transform((value) => value || undefined).optional(),
  grade: optionalText,
}).strict();

const listingInput = z.object({
  product_id: id,
  quantity,
  unit: text,
  price: money,
  currency: z.string().length(3).default("USD"),
  incoterm: optionalText,
  origin_country: optionalText,
  destination: optionalText,
}).strict();

const requirementInput = z.object({
  product_id: id,
  quantity,
  unit: text,
  target_price: money.optional(),
  currency: z.string().length(3).default("USD"),
  destination: text,
  preferred_incoterm: optionalText,
}).strict();

function failed(res: import("express").Response, error: unknown, code: string) {
  if (error instanceof z.ZodError) res.status(400).json({ error: "validation_error", details: error.issues });
  else res.status(500).json({ error: code });
}

router.get("/products", requireAuth, async (_req, res) => {
  try { res.json({ products: await db.select().from(productsTable).orderBy(desc(productsTable.createdAt)) }); }
  catch (error) { failed(res, error, "products_fetch_failed"); }
});

router.post("/products", requireRole("admin"), async (req, res) => {
  try {
    const input = productInput.parse(req.body);
    const [product] = await db.insert(productsTable).values({
      name: input.name, category: input.category, hsCode: input.hs_code,
      description: input.description, grade: input.grade,
    }).returning();
    res.status(201).json({ product });
  } catch (error) { failed(res, error, "product_create_failed"); }
});

router.get("/seller-listings", requireAuth, async (req, res) => {
  try {
    const listings = await db.select().from(sellerListingsTable)
      .where(eq(sellerListingsTable.sellerUserId, req.authUser!.id))
      .orderBy(desc(sellerListingsTable.updatedAt));
    res.json({ listings });
  } catch (error) { failed(res, error, "listings_fetch_failed"); }
});

router.post("/seller-listings", requireRole("seller"), async (req, res) => {
  try {
    const input = listingInput.parse(req.body);
    const [product] = await db.select({ id: productsTable.id }).from(productsTable)
      .where(eq(productsTable.id, input.product_id)).limit(1);
    if (!product) { res.status(404).json({ error: "product_not_found" }); return; }
    const [listing] = await db.insert(sellerListingsTable).values({
      sellerUserId: req.authUser!.id, productId: product.id,
      quantity: String(input.quantity), unit: input.unit, price: String(input.price),
      currency: input.currency.toUpperCase(), incoterm: input.incoterm,
      originCountry: input.origin_country, destination: input.destination,
      status: "pending_admin_review",
    }).returning();
    res.status(201).json({ listing });
  } catch (error) { failed(res, error, "listing_create_failed"); }
});

router.get("/buyer-requests", requireAuth, async (req, res) => {
  try {
    const requirements = await db.select().from(buyerRequestsTable)
      .where(eq(buyerRequestsTable.buyerUserId, req.authUser!.id))
      .orderBy(desc(buyerRequestsTable.updatedAt));
    res.json({ requirements });
  } catch (error) { failed(res, error, "requirements_fetch_failed"); }
});

router.post("/buyer-requests", requireRole("buyer"), async (req, res) => {
  try {
    const input = requirementInput.parse(req.body);
    const [product] = await db.select({ id: productsTable.id }).from(productsTable)
      .where(eq(productsTable.id, input.product_id)).limit(1);
    if (!product) { res.status(404).json({ error: "product_not_found" }); return; }
    const [requirement] = await db.insert(buyerRequestsTable).values({
      buyerUserId: req.authUser!.id, productId: product.id,
      quantity: String(input.quantity), unit: input.unit,
      targetPrice: input.target_price === undefined ? undefined : String(input.target_price),
      currency: input.currency.toUpperCase(), destination: input.destination,
      preferredIncoterm: input.preferred_incoterm,
      status: "pending_admin_review",
    }).returning();
    res.status(201).json({ requirement });
  } catch (error) { failed(res, error, "requirement_create_failed"); }
});

export default router;
