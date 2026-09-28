import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { buyerRequestsTable, db, dealParticipantsTable, dealsTable, notificationsTable, sellerListingsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const [requirements, listings, deals, unread] = await Promise.all([
      db.select({ status: buyerRequestsTable.status }).from(buyerRequestsTable)
        .where(eq(buyerRequestsTable.buyerUserId, userId)),
      db.select({ status: sellerListingsTable.status }).from(sellerListingsTable)
        .where(eq(sellerListingsTable.sellerUserId, userId)),
      db.select({ status: dealsTable.status }).from(dealsTable)
        .where(or(
          eq(dealsTable.buyerUserId, userId), eq(dealsTable.sellerUserId, userId),
          inArray(dealsTable.id, db.select({ dealId: dealParticipantsTable.dealId })
            .from(dealParticipantsTable).where(and(
              eq(dealParticipantsTable.userId, userId),
              eq(dealParticipantsTable.status, "active"),
            ))),
        )),
      db.select({ id: notificationsTable.id }).from(notificationsTable)
        .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt))),
    ]);
    res.json({ dashboard: {
      openOpportunities: requirements.filter((item) => item.status === "approved").length
        + listings.filter((item) => item.status === "approved").length,
      activeDeals: deals.filter((item) => !["completed", "cancelled", "rejected"].includes(item.status)).length,
      pendingReview: [...requirements, ...listings].filter((item) => item.status === "pending_admin_review").length,
      unreadNotifications: unread.length,
    } });
  } catch {
    res.status(500).json({ error: "dashboard_fetch_failed" });
  }
});

export default router;
