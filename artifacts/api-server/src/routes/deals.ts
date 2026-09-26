import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, dealsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

function dealAccess(userId: string) {
  return or(
    eq(dealsTable.buyerUserId, userId),
    eq(dealsTable.sellerUserId, userId),
  );
}

router.get("/deals", requireAuth, async (req, res) => {
  try {
    const deals = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
        productId: dealsTable.productId,
        quantity: dealsTable.quantity,
        unit: dealsTable.unit,
        agreedPrice: dealsTable.agreedPrice,
        currency: dealsTable.currency,
        incoterm: dealsTable.incoterm,
        destination: dealsTable.destination,
        status: dealsTable.status,
        createdAt: dealsTable.createdAt,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(dealAccess(req.authUser!.id))
      .orderBy(desc(dealsTable.updatedAt));

    res.json({ deals });
  } catch {
    res.status(500).json({ error: "deals_fetch_failed" });
  }
});

router.get("/deals/:dealId", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
        productId: dealsTable.productId,
        quantity: dealsTable.quantity,
        unit: dealsTable.unit,
        agreedPrice: dealsTable.agreedPrice,
        currency: dealsTable.currency,
        incoterm: dealsTable.incoterm,
        destination: dealsTable.destination,
        status: dealsTable.status,
        createdAt: dealsTable.createdAt,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    res.json({ deal });
  } catch {
    res.status(500).json({ error: "deal_fetch_failed" });
  }
});

export default router;
