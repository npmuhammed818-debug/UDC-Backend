import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

router.get("/referrals", requireAuth, async (req, res) => {
  if (req.authUser!.role !== "agent") {
    res.status(403).json({ error: "agent_access_required" });
    return;
  }

  const referrals = await db
    .select({
      id: referralsTable.id,
      agentUserId: referralsTable.agentUserId,
      referredUserId: referralsTable.referredUserId,
      referralCode: referralsTable.referralCode,
      status: referralsTable.status,
      commissionRate: referralsTable.commissionRate,
      referredName: usersTable.fullName,
      referredRole: usersTable.role,
      createdAt: referralsTable.createdAt,
      updatedAt: referralsTable.updatedAt,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.agentUserId, req.authUser!.id))
    .orderBy(desc(referralsTable.updatedAt));

  res.json({ referrals });
});

export default router;
