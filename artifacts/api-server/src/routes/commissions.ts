import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { commissionsTable, db, dealsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

router.get("/commissions", requireAuth, async (req, res) => {
  try {
    const commissions = await db
      .select({
        id: commissionsTable.id,
        dealId: commissionsTable.dealId,
        dealNumber: dealsTable.dealNumber,
        amount: commissionsTable.amount,
        currency: commissionsTable.currency,
        status: commissionsTable.status,
        commissionType: commissionsTable.commissionType,
        commissionRate: commissionsTable.commissionRate,
        paidAt: commissionsTable.paidAt,
        createdAt: commissionsTable.createdAt,
        updatedAt: commissionsTable.updatedAt,
      })
      .from(commissionsTable)
      .innerJoin(dealsTable, eq(commissionsTable.dealId, dealsTable.id))
      .where(eq(commissionsTable.beneficiaryUserId, req.authUser!.id))
      .orderBy(desc(commissionsTable.updatedAt));

    res.json({ commissions });
  } catch {
    res.status(500).json({ error: "commissions_fetch_failed" });
  }
});

export default router;
