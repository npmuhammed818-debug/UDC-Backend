import {createHmac,timingSafeEqual} from "node:crypto";
import {sql} from "drizzle-orm";
import {db} from "@workspace/db";

type Executor=Pick<typeof db,"execute">;
type MetaStatus={id?:unknown;status?:unknown;timestamp?:unknown;recipient_id?:unknown};
const allowed=new Set(["sent","delivered","read","failed"]);

export function parseMetaDeliveryStatus(value:MetaStatus,now:Date=new Date()){
  if(!value || typeof value.id!=="string" ||
    value.id.length<5 || value.id.length>255 || !/^[\w.:-]+$/.test(value.id) ||
    typeof value.recipient_id!=="string" || !/^\d{7,20}$/.test(value.recipient_id) ||
    typeof value.status!=="string" || !allowed.has(value.status))return null;
  const raw=value.timestamp;
  if(typeof raw!=="string" || !/^\d{9,11}$/.test(raw))return null;
  const instant=new Date(Number(raw)*1000);
  if(!Number.isFinite(instant.valueOf()) || instant.getTime()>now.getTime()+10*60_000 ||
    instant.getTime()<now.getTime()-30*24*60*60_000)return null;
  return {providerMessageId:value.id,providerStatus:value.status,
    phone:value.recipient_id,providerTimestamp:instant};
}

export function fingerprintRecipient(phone:string,secret:string){
  if(!secret)throw new Error("missing_whatsapp_signature_secret");
  return createHmac("sha256",secret).update("udc:delivery-recipient:"+phone).digest("hex");
}

// This MUST only be called after Meta's exact raw-body HMAC has been checked.
// Non-shipment receipt messages cannot alter other notification workflows.
export async function recordSignedShipmentStatuses(statuses:MetaStatus[],options:{
  executor?:Executor;now?:Date;secret?:string;
}={}){
  const executor=options.executor??db;
  const now=options.now??new Date();
  const secret=options.secret??process.env.WHATSAPP_APP_SECRET??"";
  if(!secret)throw new Error("missing_whatsapp_signature_secret");
  const counts={received:0,invalid:0,stored:0,applied:0,unmatched:0};
  for(const value of statuses.slice(0,50)){
    counts.received++;
    const parsed=parseMetaDeliveryStatus(value,now);
    if(!parsed){counts.invalid++;continue;}
    const {providerMessageId,providerStatus,phone,providerTimestamp}=parsed;
    const fingerprint=fingerprintRecipient(phone,secret);
    const saved=await executor.execute(sql`
      INSERT INTO public.whatsapp_shipment_receipts
        (provider_message_id,provider_status,recipient_fingerprint,provider_timestamp)
      VALUES (${providerMessageId},${providerStatus},${fingerprint},${providerTimestamp})
      ON CONFLICT (provider_message_id,provider_status,provider_timestamp)
        DO NOTHING RETURNING id
    `);
    if(saved.rows.length)counts.stored++;
    // IMPORTANT: no user-provided phone can choose an outbox row. Both the
    // Meta provider message ID and the intended recipient's current phone
    // must match a previously accepted outbound submission.
    const result=await executor.execute(sql`
      UPDATE public.whatsapp_shipment_outbox o
      SET delivery_status=CASE
          WHEN ${providerStatus}='read' THEN 'read'
          WHEN ${providerStatus}='delivered' AND o.delivery_status<>'read' THEN 'delivered'
          WHEN ${providerStatus}='sent' AND o.delivery_status='unconfirmed' THEN 'sent'
          WHEN ${providerStatus}='failed' AND o.delivery_status IN ('unconfirmed','sent') THEN 'failed'
          ELSE o.delivery_status END,
        delivered_at=CASE
          WHEN ${providerStatus} IN ('delivered','read')
            THEN COALESCE(o.delivered_at,${providerTimestamp})
          ELSE o.delivered_at END,
        read_at=CASE WHEN ${providerStatus}='read'
            THEN COALESCE(o.read_at,${providerTimestamp}) ELSE o.read_at END,
        failed_at=CASE
          WHEN ${providerStatus}='failed' AND o.delivery_status IN ('unconfirmed','sent')
            THEN COALESCE(o.failed_at,${providerTimestamp}) ELSE o.failed_at END,
        provider_status_at=GREATEST(
          COALESCE(o.provider_status_at,${providerTimestamp}),${providerTimestamp}),
        updated_at=${now}
      FROM public.users u
      WHERE o.provider_message_id=${providerMessageId}
        AND o.recipient_user_id=u.id AND u.phone=${phone}
        AND o.status='accepted'
      RETURNING o.id
    `);
    if(result.rows.length){
      counts.applied++;
      await executor.execute(sql`
        UPDATE public.whatsapp_shipment_receipts SET applied_at=COALESCE(applied_at,${now})
        WHERE provider_message_id=${providerMessageId} AND provider_status=${providerStatus}
          AND provider_timestamp=${providerTimestamp} AND recipient_fingerprint=${fingerprint}
      `);
    }else counts.unmatched++;
  }
  return counts;
}
