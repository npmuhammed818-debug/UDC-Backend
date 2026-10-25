import {sql} from "drizzle-orm";
import {db} from "@workspace/db";

export type TradeRole="buyer"|"seller"|"agent";
export const TRADE_ROLES=["buyer","seller","agent"] as const;
export const validTradeRole=(v:unknown):v is TradeRole=>
  typeof v==="string"&&TRADE_ROLES.includes(v as TradeRole);

type Executor=Pick<typeof db,"execute"|"transaction">;
export async function requestRoleChange(phone:string,target:TradeRole,
  executor:Executor=db){
  if(!/^\d{7,20}$/.test(phone)||!validTradeRole(target))
    return {status:"ineligible" as const};
  // All identity and status checks happen at the database boundary.
  // This cannot assign roles or grant access. The same user gets at most one
  // pending request, irrespective of webhook retry or multiple taps.
  return executor.transaction(async tx=>{
    const lookup=await tx.execute(sql`
      SELECT id,role,status FROM public.users WHERE phone=${phone}
        FOR UPDATE
    `);
    const user=lookup.rows[0] as {id:string;role:string;status:string}|undefined;
    if(!user||!validTradeRole(user.role)||user.status!=="verified")
      return {status:"ineligible" as const};
    if(user.role===target)return {status:"already_current" as const};
    const added=await tx.execute(sql`
      INSERT INTO public.user_role_change_requests(user_id,from_role,to_role,status)
      VALUES(${user.id},${user.role},${target},'pending')
      ON CONFLICT(user_id) WHERE status='pending' DO NOTHING
      RETURNING id
    `);
    if(!added.rows.length)return {status:"already_pending" as const};
    await tx.execute(sql`
      INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(${user.id},'whatsapp_role_change_requested','user',${user.id},
        jsonb_build_object('fromRole',${user.role}::text,'toRole',${target}::text,
          'requiresManualAuthorization',true))
    `);
    return {status:"pending" as const};
  },{isolationLevel:"serializable"});
}
export function roleChangeReply(status:
  "ineligible"|"already_current"|"already_pending"|"pending",target:TradeRole){
  if(status==="already_current")return `Your UDC account is already registered as ${target}.`;
  if(status==="already_pending")return "Your UDC role change request is already pending manual review. Your current role and deal access are unchanged.";
  if(status==="pending")return `Request saved: change your UDC role to ${target}. An admin must review it. Your current role and access remain unchanged, and extra verification may be needed.`;
  return "Role changes require an existing verified UDC account. If your account is awaiting verification, finish that review first.";
}
