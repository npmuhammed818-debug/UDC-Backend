import {poolPilotEnabled,poolCountry,normalizePoolCountry} from '../marketplace/poolPilot';
import { Router, type IRouter } from "express";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
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
import { PoolAllocationError, inviteExpiresAt, isInviteExpired, respondToPoolInvite, sendPoolInviteMessage } from "../marketplace/poolInvites";

const router: IRouter = Router();
router.use((req,res,next)=>{
 if(poolPilotEnabled()&&req.method==='POST'&&(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN))){res.sendStatus(403);return;}next();
});

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
    const [deal] = await db.select({ id: dealsTable.id,buyerUserId:dealsTable.buyerUserId,unit:dealsTable.unit }).from(dealsTable)
      .where(eq(dealsTable.id, dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }

    const pool=await db.transaction(async tx=>{
    let pilotCountry='';
    if(poolPilotEnabled()){
      const [lead]=await tx.select({country:usersTable.country,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,deal.buyerUserId)).limit(1).for('share');
      pilotCountry=normalizePoolCountry(lead?.country);
      if(!pilotCountry||lead?.status!=='verified'||lead.role!=='buyer'||deal.unit!==input.unit)throw new PoolAllocationError(409,'verified_lead_country_and_matching_unit_required');
    }
    const [pool] = await tx.insert(buyerPoolsTable).values({
      dealId,
      targetQuantity: String(input.targetQuantity),
      unit: input.unit,
      notes: input.notes,
      instrumentStructure: "bank_review_required",
      bankApprovalStatus: "not_reviewed",
    }).returning();

    await tx.insert(auditLogsTable).values({
      actorUserId: req.authUser!.id,
      action: "buyer_pool_created",
      entityType: "buyer_pool",
      entityId: pool!.id,
      metadata: { dealId, targetQuantity: input.targetQuantity, unit: input.unit,...(pilotCountry?{pilotCountry,manualReviewRequired:true}:{}) },
    });
    return pool;});
    res.status(201).json({ pool, bankReviewRequired: true,manualReviewRequired:poolPilotEnabled() });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_buyer_pool" }); return; }
    if(error instanceof PoolAllocationError){res.status(error.status).json({error:error.message});return;}
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
      if(poolPilotEnabled()){const policy=await poolCountry(tx,pool,input.buyerUserId);if(!policy.ok)throw new PoolAllocationError(409,policy.reason);if(policy.unit!==pool.unit)throw new PoolAllocationError(409,'pool_unit_changed');}
      const [buyer] = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.id, input.buyerUserId), eq(usersTable.role, "buyer"), eq(usersTable.status, "verified"))).limit(1);
      if (!buyer) throw new PoolAllocationError(409, "verified_buyer_required");
      if(poolPilotEnabled())await tx.update(buyerPoolAllocationsTable).set({status:'expired'}).where(and(eq(buyerPoolAllocationsTable.poolId,poolId),eq(buyerPoolAllocationsTable.status,'invited'),sql`${buyerPoolAllocationsTable.createdAt} <= ${new Date(Date.now()-(inviteExpiresAt(new Date(0)).getTime()))}`));
      const [capacity] = await tx.select({
        exceeded: sql<boolean>`coalesce(sum(${buyerPoolAllocationsTable.quantity}), 0) + ${String(input.quantity)}::numeric > ${pool.targetQuantity}::numeric`,
      }).from(buyerPoolAllocationsTable).where(and(
        eq(buyerPoolAllocationsTable.poolId, poolId),
        inArray(buyerPoolAllocationsTable.status, ["invited", "accepted"]),
      ));
      if (capacity?.exceeded) throw new PoolAllocationError(409, "allocation_exceeds_pool_target");
      const [prior] = await tx.select().from(buyerPoolAllocationsTable).where(and(
        eq(buyerPoolAllocationsTable.poolId, poolId), eq(buyerPoolAllocationsTable.buyerUserId, input.buyerUserId))).limit(1);
      if (prior && (prior.status === "invited" || prior.status === "accepted")) {
        throw new PoolAllocationError(409, "buyer_already_invited");
      }
      const values = {
        quantity: String(input.quantity),
        committedValue: input.committedValue == null ? null : String(input.committedValue),
        currency: input.currency.toUpperCase(),
      };
      // A buyer who declined or whose invite expired can be invited again: reset that row with a fresh invite clock.
      const [record] = prior
        ? await tx.update(buyerPoolAllocationsTable).set({ ...values, status: "invited", createdAt: new Date() })
            .where(eq(buyerPoolAllocationsTable.id, prior.id)).returning()
        : await tx.insert(buyerPoolAllocationsTable).values({ poolId, buyerUserId: input.buyerUserId, ...values }).returning();
      await tx.insert(auditLogsTable).values({ actorUserId: req.authUser!.id,
        action: "buyer_pool_allocation_created", entityType: "buyer_pool", entityId: poolId,
        metadata: { buyerUserId: input.buyerUserId, quantity: input.quantity } });
      return record && { ...record, unit: pool.unit };
    });
    const notification = poolPilotEnabled()?"not_sent_staging_review":allocation ? await sendPoolInviteMessage(input.buyerUserId, allocation.id, { quantity: String(input.quantity), unit: allocation.unit }) : undefined;
    res.status(201).json({ allocation, notification });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_buyer_pool_allocation" }); return; }
    if (error instanceof PoolAllocationError) { res.status(error.status).json({ error: error.message }); return; }
    res.status(500).json({ error: "buyer_pool_allocation_failed" });
  }
});

router.get('/admin/buyer-pools/pilot',requireRole('admin'),async(_req,res)=>{
 res.set('cache-control','no-store');if(!poolPilotEnabled()){res.sendStatus(404);return;}
 try{
  const pools=await db.select().from(buyerPoolsTable).orderBy(desc(buyerPoolsTable.createdAt)).limit(100);
  const ids=pools.map(p=>p.id);
  const allocations=ids.length?await db.select({id:buyerPoolAllocationsTable.id,poolId:buyerPoolAllocationsTable.poolId,buyerUserId:buyerPoolAllocationsTable.buyerUserId,quantity:buyerPoolAllocationsTable.quantity,status:buyerPoolAllocationsTable.status,country:usersTable.country}).from(buyerPoolAllocationsTable).innerJoin(usersTable,eq(usersTable.id,buyerPoolAllocationsTable.buyerUserId)).where(inArray(buyerPoolAllocationsTable.poolId,ids)):[];
  const reviews=ids.length?await db.select({poolId:auditLogsTable.entityId,metadata:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(inArray(auditLogsTable.entityId,ids),eq(auditLogsTable.action,'buyer_pool_pilot_reviewed'))):[];
  res.json({pools:pools.map(p=>({...p,allocations:allocations.filter(a=>a.poolId===p.id),review:reviews.find(r=>r.poolId===p.id)||null})),notice:'Same-country pilot only. Buyer interest and human review are not bank approval or a shared DLC.'});
 }catch{res.sendStatus(503);}
});
const pilotReviewSchema=z.object({note:z.string().trim().min(3).max(1000)}).strict();
router.post('/admin/buyer-pools/:poolId/pilot-review',requireRole('admin'),async(req,res)=>{
 if(!poolPilotEnabled()){res.sendStatus(404);return;}
 try{
  const id=z.string().uuid().parse(req.params.poolId),input=pilotReviewSchema.parse(req.body);
  const result=await db.transaction(async tx=>{
   const [pool]=await tx.select().from(buyerPoolsTable).where(eq(buyerPoolsTable.id,id)).limit(1).for('update');
   if(!pool)throw new PoolAllocationError(404,'buyer_pool_not_found');
   if(pool.status!=='fully_accepted')throw new PoolAllocationError(409,'all_buyers_must_accept_first');
   const policy=await poolCountry(tx,pool);if(!policy.ok)throw new PoolAllocationError(409,policy.reason);
   const [totals]=await tx.select({fills:sql<boolean>`coalesce(sum(${buyerPoolAllocationsTable.quantity}) filter(where ${buyerPoolAllocationsTable.status}='accepted'),0)=${pool.targetQuantity}::numeric`}).from(buyerPoolAllocationsTable).where(eq(buyerPoolAllocationsTable.poolId,id));
   if(!totals?.fills)throw new PoolAllocationError(409,'accepted_quantity_must_fill_pool');
   const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.entityId,id),eq(auditLogsTable.action,'buyer_pool_pilot_reviewed'))).limit(1);
   if(prior)return {reviewId:prior.id,repeated:true};
   const [event]=await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'buyer_pool_pilot_reviewed',entityType:'buyer_pool',entityId:id,metadata:{note:input.note,country:policy.country,bankReviewRequired:true,noTradeCommitment:true}}).returning({id:auditLogsTable.id});
   return {reviewId:event.id,repeated:false};
  });res.json({...result,status:'human_review_recorded',notice:'Pool review only. No shared DLC, bank approval, order, payment or shipment is created.'});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}if(error instanceof PoolAllocationError){res.status(error.status).json({error:error.message});return;}res.sendStatus(503);}
});

async function respondToInvite(req: any, res: any, decision: "accepted" | "declined") {
  try {
    const allocationId = z.string().uuid().parse(req.params["allocationId"]);
    const out = await respondToPoolInvite(req.authUser!.id, allocationId, decision);
    if (out.expired) { res.status(409).json({ error: "invite_expired" }); return; }
    res.json({ status: decision, fullyAccepted: out.fullyAccepted, poolStatus: out.poolStatus });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "invalid_invite_id" }); return; }
    if (error instanceof PoolAllocationError) { res.status(error.status).json({ error: error.message }); return; }
    res.status(500).json({ error: "buyer_pool_invite_response_failed" });
  }
}
router.post("/buyer-pools/invites/:allocationId/accept", requireRole("buyer"), (req, res) => respondToInvite(req, res, "accepted"));
router.post("/buyer-pools/invites/:allocationId/decline", requireRole("buyer"), (req, res) => respondToInvite(req, res, "declined"));

router.get("/buyer-pools/mine", requireAuth, async (req, res) => {
  try {
    const allocations = await db.select({
      allocationId: buyerPoolAllocationsTable.id,
      invitedAt: buyerPoolAllocationsTable.createdAt,
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
      allocations: allocations.map((a) => ({
        ...a,
        inviteExpiresAt: a.allocationStatus === "invited" ? inviteExpiresAt(a.invitedAt).toISOString() : null,
        allocationStatus: a.allocationStatus === "invited" && isInviteExpired(a.invitedAt) ? "expired" : a.allocationStatus,
      })),
      notice: "Bank instrument structure is subject to issuing-bank approval. UDC does not represent independent buyer commitments as a single LC/DLC unless formally approved.",
    });
  } catch {
    res.status(500).json({ error: "buyer_pools_fetch_failed" });
  }
});

export default router;
