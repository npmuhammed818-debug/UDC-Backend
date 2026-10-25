import {Router,type IRouter} from "express";
import {and,desc,eq,sql} from "drizzle-orm";
import {z} from "zod/v4";
import {db,userRoleChangeRequestsTable,usersTable,auditLogsTable,notificationsTable} from "@workspace/db";
import {requireRole,type AuthenticatedRequest} from "../auth/middleware";
const router:IRouter=Router();

// No email, phone, bank documents, or identity papers in the review list.
router.get("/admin/role-change-requests",requireRole("admin"),async(_req,res)=>{
  try{
    const requests=await db.select({
      id:userRoleChangeRequestsTable.id,userId:userRoleChangeRequestsTable.userId,
      fromRole:userRoleChangeRequestsTable.fromRole,toRole:userRoleChangeRequestsTable.toRole,
      status:userRoleChangeRequestsTable.status,createdAt:userRoleChangeRequestsTable.createdAt,
      reviewedAt:userRoleChangeRequestsTable.reviewedAt,
    }).from(userRoleChangeRequestsTable)
      .orderBy(desc(userRoleChangeRequestsTable.createdAt)).limit(50);
    res.set("Cache-Control","no-store").json({requests,autoSwitchEnabled:false});
  }catch{res.status(503).json({error:"role_change_review_unavailable"});}
});
const review=z.object({
  decision:z.enum(["reviewed","rejected","activate"]),
  note:z.string().trim().max(500).optional(),
  verificationConfirmed:z.literal(true).optional(),
}).strict();
router.post("/admin/role-change-requests/:requestId/review",
  requireRole("admin"),async(req:AuthenticatedRequest,res)=>{
  try{
    const id=z.string().uuid().parse(req.params["requestId"]);
    const input=review.parse(req.body);
    const result=await db.transaction(async tx=>{
      const rows=await tx.execute(sql`
        SELECT r.id,r.user_id,r.from_role,r.to_role,r.status,u.role,u.status AS user_status
        FROM public.user_role_change_requests r
        JOIN public.users u ON u.id=r.user_id
        WHERE r.id=${id} FOR UPDATE OF r,u
      `);
      const item=rows.rows[0] as {id:string;user_id:string;from_role:string;to_role:string;
        status:string;role:string;user_status:string}|undefined;
      if(!item)return "not_found" as const;
      if(item.status!=="pending")return "already_reviewed" as const;
      if(item.role!==item.from_role||item.user_status!=="verified")
        return "account_changed" as const;
      if(input.decision==="activate"){
        if(input.verificationConfirmed!==true||!input.note||input.note.length<12)
          return "verification_required" as const;
        // Fail closed: do not reassign any existing trade obligation or referral.
        // Historical ownership and commission attribution must not be rewritten.
        const obligations=await tx.execute(sql`
          SELECT
            EXISTS(SELECT 1 FROM public.deals WHERE buyer_user_id=${item.user_id} OR seller_user_id=${item.user_id}) AS has_deals,
            EXISTS(SELECT 1 FROM public.referrals WHERE agent_user_id=${item.user_id} OR referred_user_id=${item.user_id}) AS has_referrals,
            EXISTS(SELECT 1 FROM public.buyer_requests WHERE buyer_user_id=${item.user_id}) AS has_requests,
            EXISTS(SELECT 1 FROM public.seller_listings WHERE seller_user_id=${item.user_id}) AS has_listings
        `);
        const flags=obligations.rows[0] as Record<string,boolean>|undefined;
        if(!flags||Object.values(flags).some(Boolean))return "existing_obligations" as const;
        // Update identity and revoke every browser session in the same transaction.
        // WhatsApp conversation state must also be invalidated before enabling this path.
        return "conversation_invalidation_pending" as const;
      }
      // Reviewed does not confer approval or access. Require a verified\n      // account and lock both request and identity to avoid stale review.\n      // Deliberately NOT an approval/role update: switching canonical
      // users.role could grant unrelated deal/referral access or erase role
      // history. A later vetted multi-role schema is required.
      await tx.execute(sql`
        UPDATE public.user_role_change_requests
        SET status=${input.decision},reviewer_user_id=${req.authUser!.id},
          review_note=${input.note??null},reviewed_at=now(),updated_at=now()
        WHERE id=${id} AND status='pending'
      `);
      await tx.insert(auditLogsTable).values({
        actorUserId:req.authUser!.id,action:"role_change_request_reviewed",
        entityType:"user",entityId:item.user_id,
        metadata:{fromRole:item.from_role,toRole:item.to_role,decision:input.decision,
          permissionsUnchanged:true},
      });
      await tx.insert(notificationsTable).values({
        userId:item.user_id,type:"role_change_review",
        title:"UDC role request reviewed",
        body:input.decision==="rejected"
          ?"Your role change request was declined. Your current account remains unchanged."
          :"UDC has reviewed your requested role change. Your existing role remains active; further verification and account setup may be required.",
        link:"/profile",
      });
      return "recorded" as const;
    },{isolationLevel:"serializable"});
    if(result==="not_found"){res.status(404).json({error:"request_not_found"});return;}
    if(result!=="recorded"){res.status(409).json({error:result});return;}
    res.set("Cache-Control","no-store").json({
      reviewed:true,roleChanged:false,requiresManualTransition:true,
    });
  }catch(e){
    if(e instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}
    res.status(503).json({error:"role_change_review_unavailable"});
  }
});
export default router;
