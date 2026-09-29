import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { buyerRequestsTable, db, matchesTable, sellerListingsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

router.get("/buyer-requirements", requireAuth, async (req, res) => {
  try {
    const requirements = await db
      .select()
      .from(buyerRequestsTable)
      .where(eq(buyerRequestsTable.buyerUserId, req.authUser!.id))
      .orderBy(desc(buyerRequestsTable.updatedAt));

    res.json({ requirements });
  } catch {
    res.status(500).json({ error: "buyer_requirements_fetch_failed" });
  }
});

router.get("/seller-offers", requireAuth, async (req, res) => {
  try {
    const offers = await db
      .select()
      .from(sellerListingsTable)
      .where(eq(sellerListingsTable.sellerUserId, req.authUser!.id))
      .orderBy(desc(sellerListingsTable.updatedAt));

    res.json({ offers });
  } catch {
    res.status(500).json({ error: "seller_offers_fetch_failed" });
  }
});

router.get("/buyer-matching-offers", requireAuth, async (req, res) => {
  try {
    const offers = await db
      .select({
        matchId: matchesTable.id,
        buyerRequestId: buyerRequestsTable.id,
        matchedAt: matchesTable.createdAt,
        quantity: sellerListingsTable.quantity,
        unit: sellerListingsTable.unit,
        price: sellerListingsTable.price,
        currency: sellerListingsTable.currency,
        incoterm: sellerListingsTable.incoterm,
        originCountry: sellerListingsTable.originCountry,
        destination: sellerListingsTable.destination,
        specification: sellerListingsTable.specification,
        availability: sellerListingsTable.availability,
      })
      .from(matchesTable)
      .innerJoin(buyerRequestsTable, eq(matchesTable.buyerRequestId, buyerRequestsTable.id))
      .innerJoin(sellerListingsTable, eq(matchesTable.sellerListingId, sellerListingsTable.id))
      .where(and(
        eq(buyerRequestsTable.buyerUserId, req.authUser!.id),
        eq(matchesTable.status, "approved"),
        eq(sellerListingsTable.status, "approved"),
      ))
      .orderBy(desc(matchesTable.createdAt));

    res.json({ offers });
  } catch {
    res.status(500).json({ error: "buyer_matching_offers_fetch_failed" });
  }
});

export default router;
