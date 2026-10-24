import {createHmac,timingSafeEqual} from "node:crypto";
import {sql} from "drizzle-orm";
import {db} from "@workspace/db";

type Executor=Pick<typeof db,"execute">;
const WINDOW_MS=24*60*60_000;
const SEND_SAFETY_MS=5*60_000;
const CLOCK_SKEW_MS=2*60_000;

// Never store a phone number, customer message, or raw provider message ID.
// This domain separation also avoids accidental collisions with receipt hashes.
function fingerprint(value:string,purpose:string,secret:string){
  if(!secret)throw Error("missing_whatsapp_signature_secret");
  return createHmac("sha256",secret).update("udc:"+purpose+":"+value).digest("hex");
}
export function validInboundInstant(timestamp:unknown,now:Date=new Date()){
  if(typeof timestamp!=="string"||!/^\d{9,11}$/.test(timestamp))return null;
  const instant=new Date(Number(timestamp)*1000);
  if(!Number.isFinite(instant.valueOf())||
     instant.valueOf()>now.valueOf()+CLOCK_SKEW_MS||
     instant.valueOf()<now.valueOf()-WINDOW_MS)return null;
  return instant;
}

// Caller contract: only use after exact raw-body Meta HMAC verification,
// existing privacy consent, and an eligible customer account lookup.
export async function recordSignedCustomerInbound(
  input:{phone:string;providerMessageId:unknown;timestamp:unknown},
  options:{executor?:Executor;now?:Date;secret?:string}={}
){
  const now=options.now??new Date(),executor=options.executor??db;
  const secret=options.secret??process.env.WHATSAPP_APP_SECRET??"";
  if(!secret)throw Error("missing_whatsapp_signature_secret");
  const instant=validInboundInstant(input.timestamp,now);
  if(!instant||! /^\d{7,20}$/.test(input.phone)||
    typeof input.providerMessageId!=="string"||
    input.providerMessageId.length<5||input.providerMessageId.length>255||
    !/^[\w.:-]+$/.test(input.providerMessageId))return {recorded:false,reason:"invalid_signed_message" as const};
  const phoneHash=fingerprint(input.phone,"window_phone",secret);
  const messageHash=fingerprint(input.providerMessageId,"window_message",secret);
  // Atomic compare-and-set: replay or delayed signed webhook deliveries
  // must NEVER extend the most recent customer service window.
  const result=await executor.execute(sql`
    INSERT INTO public.whatsapp_customer_windows
      (user_id,phone_fingerprint,provider_message_fingerprint,last_inbound_at,recorded_at)
    SELECT id,${phoneHash},${messageHash},${instant},${now}
      FROM public.users WHERE phone=${input.phone} AND status='verified'
    ON CONFLICT(user_id) DO UPDATE SET
      phone_fingerprint=EXCLUDED.phone_fingerprint,
      provider_message_fingerprint=EXCLUDED.provider_message_fingerprint,
      last_inbound_at=EXCLUDED.last_inbound_at,
      recorded_at=EXCLUDED.recorded_at
    WHERE public.whatsapp_customer_windows.last_inbound_at<EXCLUDED.last_inbound_at
    RETURNING user_id
  `);
  return {recorded:result.rows.length>0};
}

// Authorization for OUTBOUND PLAIN-TEXT only. Outside this period, UDC must
// use a separately approved template implementation (not yet shipped).
// The shipment outbox also verifies current user/phone, preferences and deal
// membership before calling this function. No live worker is wired to it.
export async function authorizeCustomerWindow(
  phone:string,userId:string,_dealId:string,
  options:{executor?:Executor;now?:Date;secret?:string}={}
){
  const now=options.now??new Date(),secret=options.secret??process.env.WHATSAPP_APP_SECRET??"";
  if(!secret||!/^\d{7,20}$/.test(phone)||
    !/^[0-9a-fA-F-]{36}$/.test(userId)||!Number.isFinite(now.valueOf()))return false;
  const executor=options.executor??db;
  const result=await executor.execute(sql`
    SELECT w.phone_fingerprint,w.last_inbound_at
    FROM public.whatsapp_customer_windows w
    JOIN public.users u ON u.id=w.user_id
    WHERE w.user_id=${userId} AND u.phone=${phone} AND u.status='verified'
    LIMIT 1
  `);
  const evidence=result.rows[0] as {phone_fingerprint?:string;last_inbound_at?:Date}|undefined;
  if(!evidence||!evidence.phone_fingerprint||
    !/^[0-9a-f]{64}$/.test(evidence.phone_fingerprint))return false;
  const current=fingerprint(phone,"window_phone",secret);
  const expected=Buffer.from(current,"hex"),actual=Buffer.from(evidence.phone_fingerprint,"hex");
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return false;
  const last=new Date(evidence.last_inbound_at??"");
  const delta=now.valueOf()-last.valueOf();
  return Number.isFinite(delta) && delta>=0 && delta<WINDOW_MS-SEND_SAFETY_MS;
}
