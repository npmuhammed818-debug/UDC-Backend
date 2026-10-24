import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {db} from "@workspace/db";
type Client=Pick<typeof db,"execute">;
type Job={id:string,deal_id:string,recipient_user_id:string,claim_token:string,attempts:number};
type Recipient={phone:string,body:string,user_id:string};
type Result={delivered:true;messageId?:string}|{delivered:false;reason:"not_configured"|"preflight_unavailable"|"provider_rejected"};
export async function enqueueShipmentWhatsApp(executor:Client,input:{
  notificationId:string;dealId:string;recipientUserId:string;
}){
  const result=await executor.execute(sql`
    INSERT INTO public.whatsapp_shipment_outbox(notification_id,deal_id,recipient_user_id)
    VALUES (${input.notificationId},${input.dealId},${input.recipientUserId})
    ON CONFLICT(notification_id) DO NOTHING RETURNING id
  `);
  return result.rows.length===1;
}

// No automatic production dispatch. A transport and a policy authorization
// function must be supplied explicitly; the caller verifies a valid 24h
// inbound conversation window or approved template before any send.
export async function runShipmentWhatsAppOutbox(options:{
  executor?:Client;
  enabled?:boolean;
  send?:(phone:string,body:string)=>Promise<Result>;
  policyAuthorized?:(phone:string,userId:string,dealId:string)=>Promise<boolean>;
  now?:Date;
  batchSize?:number;
}={}){
  if(options.enabled!==true||!options.send||!options.policyAuthorized)
    return {enabled:false,claimed:0,accepted:0,retry:0,uncertain:0,blocked:0,cancelled:0};
  const executor=options.executor??db;
  const now=options.now??new Date();
  if(!Number.isFinite(now.valueOf()))throw Error("invalid_now");
  const counts={enabled:true,claimed:0,accepted:0,retry:0,uncertain:0,blocked:0,cancelled:0};
  // Expired leases are ambiguous: a worker could have contacted Meta.
  await executor.execute(sql`
    UPDATE public.whatsapp_shipment_outbox SET status='uncertain',claim_token=NULL,
      lease_until=NULL,last_failure_category='provider_outcome_unknown',updated_at=${now}
    WHERE status='leased' AND lease_until<=${now}
  `);
  for(let i=0;i<Math.max(1,Math.min(10,Math.trunc(options.batchSize??5)));i++){
    const token=randomUUID(),leaseEnd=new Date(now.getTime()+90_000);
    const r=await executor.execute(sql`
      WITH candidate AS (
        SELECT id FROM public.whatsapp_shipment_outbox
        WHERE status IN ('pending','retry') AND attempts<3 AND next_attempt_at<=${now}
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE public.whatsapp_shipment_outbox o
      SET status='leased',attempts=o.attempts+1,claim_token=${token},
        lease_until=${leaseEnd},updated_at=${now}
      FROM candidate WHERE o.id=candidate.id
      RETURNING o.id,o.deal_id,o.recipient_user_id,o.attempts,o.claim_token
    `);
    const job=r.rows[0] as Job|undefined;
    if(!job)break;
    counts.claimed++;
    async function finish(next:"accepted"|"retry"|"uncertain"|"blocked"|"cancelled",
      reason?:string,messageId?:string){
      const state=next==="retry"&&job!.attempts>=3?"blocked":next;
      const waitMinutes=[1,5,30][Math.min(job!.attempts-1,2)];
      const notBefore=new Date(now.getTime()+waitMinutes*60_000);
      const updated=await executor.execute(sql`
        UPDATE public.whatsapp_shipment_outbox SET status=${state},
          claim_token=NULL,lease_until=NULL,next_attempt_at=${notBefore},
          provider_message_id=${messageId??null},
          accepted_at=${state==="accepted"?now:null},updated_at=${now},
          last_failure_category=${reason??null}
        WHERE id=${job!.id} AND status='leased' AND claim_token=${token}
          AND lease_until>${now}
        RETURNING id
      `);
      if(!updated.rows.length)throw Error("outbox_lease_lost");
      if(state==="accepted")counts.accepted++;
      if(state==="retry")counts.retry++;
      if(state==="uncertain")counts.uncertain++;
      if(state==="blocked")counts.blocked++;
      if(state==="cancelled")counts.cancelled++;
    }
    // Recover current recipient state; never use a stale phone stored in queue.
    const audience=await executor.execute(sql`
      SELECT u.id AS user_id,u.phone,n.body
      FROM public.whatsapp_shipment_outbox o
      JOIN public.notifications n ON n.id=o.notification_id AND n.user_id=o.recipient_user_id
      JOIN public.users u ON u.id=o.recipient_user_id
      JOIN public.deals d ON d.id=o.deal_id
      JOIN public.notification_preferences p ON p.user_id=u.id
      WHERE o.id=${job.id} AND o.claim_token=${token}
        AND u.status IN ('verified','active') AND u.phone IS NOT NULL
        AND p.optional_whatsapp=true AND p.reminders=true
        AND (d.buyer_user_id=u.id OR d.seller_user_id=u.id
          OR (u.role='agent' AND EXISTS(
            SELECT 1 FROM public.deal_participants dp
            WHERE dp.deal_id=d.id AND dp.user_id=u.id
              AND dp.participant_role='agent' AND dp.status='active')))
      LIMIT 1
    `);
    const user=audience.rows[0] as Recipient|undefined;
    if(!user){await finish("cancelled","recipient_ineligible");continue;}
    let allowed=false;
    try{allowed=await options.policyAuthorized(user.phone,user.user_id,job.deal_id);}
    catch{allowed=false;}
    if(!allowed){await finish("blocked","policy_unverified");continue;}
    try{
      const result=await options.send(user.phone,user.body);
      if(result.delivered&&result.messageId)await finish("accepted",undefined,result.messageId);
      else if(!result.delivered && (result.reason==="not_configured"||result.reason==="preflight_unavailable"))
        await finish("retry","configuration_missing");
      else if(!result.delivered && result.reason==="provider_rejected")
        await finish("blocked","provider_rejected");
      else await finish("uncertain","provider_outcome_unknown");
    }catch{
      // A network timeout after sending may mean Meta accepted the message.
      await finish("uncertain","provider_outcome_unknown");
    }
  }
  return counts;
}
