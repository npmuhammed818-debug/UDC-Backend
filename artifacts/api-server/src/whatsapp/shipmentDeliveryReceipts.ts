import {createHmac,timingSafeEqual} from "node:crypto";
import {sql} from "drizzle-orm";
import {db} from "@workspace/db";

type Executor=Pick<typeof db,"execute">;
type MetaStatus={id?:unknown;status?:unknown;timestamp?:unknown;recipient_id?:unknown};
const allowed=new Set(["sent","delivered","read","failed"]);

export function parseMetaDeliveryStatus(value:MetaStatus,now:Date=new Date()){
  if(!value || typeof value.id!=="string" ||
    value.id.length<5 || value.id.length>255 || !/^[A-Za-z0-9_.:+/=-]+$/.test(value.id) ||
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

// Reconciles a signed receipt journal entry that arrived BEFORE an outbound
// Meta ID was committed. Does NOT send a message or trust new client input.
// Only the same current recipient, proven by the stored HMAC, can be updated.
export async function reconcileStoredShipmentReceipts(options:{
  executor?:Executor;secret?:string;now?:Date;limit?:number;
}={}){
  const executor=options.executor??db;
  const secret=options.secret??process.env.WHATSAPP_APP_SECRET??"";
  if(!secret)throw new Error("missing_whatsapp_signature_secret");
  const now=options.now??new Date();
  if(!Number.isFinite(now.valueOf()))throw new Error("invalid_now");
  const limit=Math.max(1,Math.min(100,Math.trunc(options.limit??50)));
  const list=await executor.execute(sql`
    SELECT r.provider_message_id,r.provider_status,r.provider_timestamp,
      r.recipient_fingerprint,u.phone
    FROM public.whatsapp_shipment_receipts r
    JOIN public.whatsapp_shipment_outbox o
      ON o.provider_message_id=r.provider_message_id AND o.status='accepted'
    JOIN public.users u ON u.id=o.recipient_user_id
    WHERE r.applied_at IS NULL AND u.phone IS NOT NULL
      AND r.created_at>=${new Date(now.getTime()-30*24*60*60_000)}
    ORDER BY r.created_at,r.id
    LIMIT ${limit}
  `);
  const totals={checked:0,applied:0,recipientChanged:0};
  for(const row of list.rows as Array<{provider_message_id:string;
    provider_status:string;provider_timestamp:Date;recipient_fingerprint:string;phone:string}>){
    totals.checked++;
    const expected=fingerprintRecipient(row.phone,secret);
    const left=Buffer.from(expected,"hex"),right=Buffer.from(row.recipient_fingerprint??"","hex");
    if(left.length!==right.length||!timingSafeEqual(left,right)){
      totals.recipientChanged++;continue;
    }
    const event={id:row.provider_message_id,status:row.provider_status,
      recipient_id:row.phone,timestamp:Math.floor(new Date(row.provider_timestamp).getTime()/1000).toString()};
    const result=await recordSignedShipmentStatuses([event],{executor,now,secret});
    totals.applied+=result.applied;
  }
  // Retain only 30 days of receipt metadata, including unmatched IDs. No
  // raw messages or phone numbers were ever stored in this table.
  await executor.execute(sql`
    DELETE FROM public.whatsapp_shipment_receipts
    WHERE created_at<${new Date(now.getTime()-30*24*60*60_000)}
  `);
  return totals;
}
