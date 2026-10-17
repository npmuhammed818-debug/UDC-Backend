import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  auditLogsTable,
  buyerPoolAllocationsTable,
  buyerPoolsTable,
  db,
  dealsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../auth/middleware";

const router: IRouter = Router();
class PoolAllocationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}


const createPoolSchema = z.object({
  targetQuantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(30),
  notes: z.string().trim().max(1500).optional(),
}).strict();

const allocationSchema = z.object({
  buyerUserId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  committedValue: z.coerce.number().positive().optional(),
  currency: z.string().trim().length(3).default("USD"),
}).strict();

router.post("/admin/deals/:dealId/buyer-pool", requireRole("admin"), async (req, res) => {
  try {
    const dealId = z.string().uuid().parse(req.params["dealId"]);
    const input = createPoolSchema.parse(req.body);
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(eq(dealsTable.id, dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }

    const [pool] = await db.insert(buyerPoolsTable).values({
      dealId,
      targetQuantity: String(input.targetQuantity),
      unit: input.unit,
      notes: input.notes,
      instrumentStructure: "bank_review_required",
      bankApprovalStatus: "not_reviewed",
    }).returning();

    await db.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "buyer_pool_created",
      entityType: "buyer_pool",
      entityId: pool!.id,
      metadata: { dealId, targetQuantity: input.targetQuantity, unit: input.unit },
    });
    res.status(201).json({ pool, bankReviewRequired: true });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_buyer_pool" }); return; }
    res.status(500).json({ error: "buyer_pool_create_failed" });
  }
});

router.post("/admin/buyer-pools/:poolId/allocations", requireRole("admin"), async (req, res) => {
  try {
    const poolId = z.string().uuid().parse(req.params["poolId"]);
    const input = allocationSchema.parse(req.body);
    const allocation = await db.transaction(async (tx) => {
      // Serialize allocations for this pool so two admins cannot overfill it.
      const [pool] = await tx.select().from(buyerPoolsTable)
        .where(eq(buyerPoolsTable.id, poolId)).limit(1).for("update");
      if (!pool) throw new PoolAllocationError(404, "buyer_pool_not_found");
      if (pool.status !== "forming") throw new PoolAllocationError(409, "buyer_pool_not_forming");
      const [buyer] = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.id, input.buyerUserId), eq(usersTable.role, "buyer"), eq(usersTable.status, "verified"))).limit(1);
      if (!buyer) throw new PoolAllocationError(409, "verified_buyer_required");
      const [capacity] = await tx.select({
        exceeded: sql<boolean>`coalesce(sum(${buyerPoolAllocationsTable.quantity}), 0) + ${String(input.quantity)}::numeric > ${pool.targetQuantity}::numeric`,
      }).from(buyerPoolAllocationsTable).where(eq(buyerPoolAllocationsTable.poolId, poolId));
      if (capacity?.exceeded) throw new PoolAllocationError(409, "allocation_exceeds_pool_target");
      const [record] = await tx.insert(buyerPoolAllocationsTable).values({
        poolId, buyerUserId: input.buyerUserId, quantity: String(input.quantity),
        committedValue: input.committedValue == null ? null : String(input.committedValue),
        currency: input.currency.toUpperCase(),
      }).returning();
      await tx.insert(auditLogsTable).values({ actorUserId: req.authUser!.id,
        action: "buyer_pool_allocation_created", entityType: "buyer_pool", entityId: poolId,
        metadata: { buyerUserId: input.buyerUserId, quantity: input.quantity } });
      return record;
    });
    res.status(201).json({ allocation });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_buyer_pool_allocation" }); return; }
    if (error instanceof PoolAllocationError) { res.status(error.status).json({ error: error.message }); return; }
    res.status(500).json({ error: "buyer_pool_allocation_failed" });
  }
});

router.get("/buyer-pools/mine", requireAuth, async (req, res) => {
  try {
    const allocations = await db.select({
      poolId: buyerPoolsTable.id,
      dealId: buyerPoolsTable.dealId,
      poolStatus: buyerPoolsTable.status,
      targetQuantity: buyerPoolsTable.targetQuantity,
      unit: buyerPoolsTable.unit,
      bankApprovalStatus: buyerPoolsTable.bankApprovalStatus,
      quantity: buyerPoolAllocationsTable.quantity,
      committedValue: buyerPoolAllocationsTable.committedValue,
      currency: buyerPoolAllocationsTable.currency,
      allocationStatus: buyerPoolAllocationsTable.status,
      instrumentStatus: buyerPoolAllocationsTable.instrumentStatus,
    }).from(buyerPoolAllocationsTable)
      .innerJoin(buyerPoolsTable, eq(buyerPoolAllocationsTable.poolId, buyerPoolsTable.id))
      .where(eq(buyerPoolAllocationsTable.buyerUserId, req.authUser!.id));

    res.json({
      allocations,
      notice: "Bank instrument structure is subject to issuing-bank approval. UDC does not represent independent buyer commitments as a single LC/DLC unless formally approved.",
    });
  } catch {
    res.status(500).json({ error: "buyer_pools_fetch_failed" });
  }
});

export default router;
