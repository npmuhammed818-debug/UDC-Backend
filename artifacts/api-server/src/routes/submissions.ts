import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { buyerRequestsTable, db, sellerListingsTable } from "@workspace/db";
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

export default router;
