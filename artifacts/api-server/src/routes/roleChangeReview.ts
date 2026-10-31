import {Router,type IRouter} from "express";
import {and,desc,eq,sql} from "drizzle-orm";
import {z} from "zod/v4";
import {db,userRoleChangeRequestsTable,usersTable,auditLogsTable,notificationsTable} from "@workspace/db";
import {requireRole,type AuthenticatedRequest} from "../auth/middleware";
import {guidedChatPhoneHash} from "../whatsapp/phoneFingerprint";
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
    const run=()=>db.transaction(async tx=>{
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
        // Buyer and seller roles need a human-verified company. Agents need none, and an
        // agent switching to buyer/seller has no company yet, so that stays blocked.
        if(item.to_role==="buyer"||item.to_role==="seller"){
          const company=await tx.execute(sql`
            SELECT 1 FROM public.companies WHERE owner_user_id=${item.user_id} AND verification_status='verified' LIMIT 1
          `);
          if(!company.rows.length)return "company_verification_required" as const;
        }
        // Everything below is one transaction: role, sessions, WhatsApp state, request, audit, notice.
        const moved=await tx.execute(sql`
          UPDATE public.users SET role=${item.to_role},updated_at=now()
          WHERE id=${item.user_id} AND role=${item.from_role} AND status='verified' RETURNING phone
        `);
        if(!moved.rows.length)return "account_changed" as const;
        const phone=(moved.rows[0] as {phone:string|null}).phone;
        await tx.execute(sql`UPDATE public.auth_sessions SET revoked_at=now() WHERE user_id=${item.user_id} AND revoked_at IS NULL`);
        await tx.execute(sql`UPDATE public.whatsapp_signin_challenges SET status='expired' WHERE (link_user_id=${item.user_id} OR approved_user_id=${item.user_id}) AND status='pending'`);
        if(phone){
          // Role-bound WhatsApp state: half-finished intake and guided-chat steps are dropped,
          // so the next message starts clean under the new role. Nothing historical is touched.
          await tx.execute(sql`DELETE FROM public.whatsapp_intake_drafts WHERE phone=${phone}`);
          await tx.execute(sql`DELETE FROM public.whatsapp_chat_sessions WHERE phone_hash=${guidedChatPhoneHash(phone)}`);
        }
        await tx.execute(sql`
          UPDATE public.user_role_change_requests
          SET status='activated',reviewer_user_id=${req.authUser!.id},review_note=${input.note??null},reviewed_at=now(),updated_at=now()
          WHERE id=${id} AND status='pending'
        `);
        await tx.insert(auditLogsTable).values({
          actorUserId:req.authUser!.id,action:"role_change_activated",entityType:"user",entityId:item.user_id,
          metadata:{fromRole:item.from_role,toRole:item.to_role,requestId:id,sessionsRevoked:true,whatsappStateReset:true,
            historyPreserved:true},
        });
        await tx.insert(notificationsTable).values({
          userId:item.user_id,type:"role_change_review",title:"UDC role changed",
          body:`Your UDC account is now a ${item.to_role} account. Please sign in again. Your earlier activity stays on record under your previous role.`,
          link:"/profile",
        });
        return "activated" as const;
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
    // Concurrent reviews of one request conflict at SERIALIZABLE (40001). Retry, so the loser sees
    // the committed outcome ("already_reviewed") instead of a 503.
    let result:Awaited<ReturnType<typeof run>>|undefined;
    for(let attempt=1;attempt<=4&&result===undefined;attempt++){
      try{result=await run();}
      catch(e){
        const code=(e as {code?:string;cause?:{code?:string}})?.code??(e as {cause?:{code?:string}})?.cause?.code;
        if(code!=="40001"||attempt===4)throw e;
      }
    }
    if(result===undefined)throw new Error("role_review_no_result");
    if(result==="not_found"){res.status(404).json({error:"request_not_found"});return;}
    if(result!=="recorded"&&result!=="activated"){res.status(409).json({error:result});return;}
    res.set("Cache-Control","no-store").json({
      reviewed:true,roleChanged:result==="activated",requiresManualTransition:result!=="activated",
    });
  }catch(e){
    if(e instanceof z.ZodError){res.status(400).json({error:"validation_error"});return;}
    res.status(503).json({error:"role_change_review_unavailable"});
  }
});
export default router;
