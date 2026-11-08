import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { buyerRequestsTable, db, dealsTable, notificationsTable, sellerListingsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { dealAccess } from "../deals/access";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const [requirements, listings, deals, unread] = await Promise.all([
      db.select({ status: buyerRequestsTable.status }).from(buyerRequestsTable)
        .where(req.authUser!.role === "admin" ? sql`true` : eq(buyerRequestsTable.buyerUserId, userId)),
      db.select({ status: sellerListingsTable.status }).from(sellerListingsTable)
        .where(req.authUser!.role === "admin" ? sql`true` : eq(sellerListingsTable.sellerUserId, userId)),
      // Same rule as the deal routes: principal identity plus, only while the
      // account is an agent, active agent assignments. A historical assignment
      // must not keep counting another deal after a role change.
      db.select({ status: dealsTable.status }).from(dealsTable)
        .where(dealAccess(userId, req.authUser!.role)),
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
