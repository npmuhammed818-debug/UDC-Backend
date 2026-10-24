import {createHmac} from "node:crypto";
import type {AuthEmail,SendAuthEmail} from "./emailDelivery";

export type ResendAuthConfig={
  apiKey:string;
  from:string;
  verifiedDomain:string;
  idempotencySecret:string;
};
const RESEND_API="https://api.resend.com/emails";
const MAX_RECEIPT_BYTES=4_096;

function senderAddress(from:string){
  const parsed=/^(?:[A-Za-z0-9 .'-]{1,70} <)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63})>?$/.exec(from);
  return parsed?.[1]?.toLowerCase()??null;
}
export function validateResendConfig(config:ResendAuthConfig){
  const sender=senderAddress(config.from.trim()),domain=config.verifiedDomain.toLowerCase().trim();
  return Boolean(
    /^re_[A-Za-z0-9_-]{8,}$/.test(config.apiKey.trim()) &&
    sender && /^[a-z0-9.-]{4,253}$/.test(domain) &&
    sender.split("@")[1]===domain && domain!=="resend.dev" &&
    config.idempotencySecret.length>=32,
  );
}
export function resendTransportConfigured(env:NodeJS.ProcessEnv=process.env){
  return env.UDC_AUTH_EMAIL_TRANSPORT==="resend" &&
    env.UDC_AUTH_EMAIL_SEND_ENABLED==="true" &&
    validateResendConfig({
      apiKey:env.RESEND_API_KEY??"",
      from:env.UDC_AUTH_EMAIL_FROM??"",
      verifiedDomain:env.UDC_AUTH_EMAIL_VERIFIED_DOMAIN??"",
      idempotencySecret:env.SESSION_SECRET??"",
    });
}
export function makeAuthEmailText(message:AuthEmail){
  const descriptions={
    verify_email:"verify your UDC email address",
    reset_password:"reset your UDC password",
    link_phone:"recover your UDC account on a new WhatsApp number",
  } as const;
  if(!Object.hasOwn(descriptions,message.purpose) ||
    !/^\d{6}$/.test(message.code) ||
    !Number.isFinite(message.expiresAt.getTime()) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to))throw Error("invalid_auth_email");
  return `Your UDC verification code is: ${message.code}\n\nUse this code to ${descriptions[message.purpose]}. The code expires in 10 minutes. Never share it with anyone.\n\nIf you did not request this, ignore the message. UDC will never ask for your code by phone or chat.`;
}
async function readBoundedReceipt(response:Response):Promise<string>{
  if(Number(response.headers.get("content-length")??0)>MAX_RECEIPT_BYTES){
    await response.body?.cancel();
    throw Error("email_delivery_unavailable");
  }
  if(!response.body)throw Error("email_delivery_unavailable");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_RECEIPT_BYTES){await reader.cancel();throw Error("email_delivery_unavailable");}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(all);
}
export function createResendAuthSender(config:ResendAuthConfig,transport:typeof fetch=fetch):SendAuthEmail{
  // Validate before constructing a sender, and also at invocation so errors
  // can never silently fall back to console, logs or a test inbox.
  if(!validateResendConfig(config))throw Error("email_delivery_unavailable");
  return async(message,signal)=>{
    if(signal.aborted||!validateResendConfig(config))throw Error("email_delivery_unavailable");
    const text=makeAuthEmailText(message);
    const idempotencyKey=createHmac("sha256",config.idempotencySecret)
      .update(JSON.stringify(["udc-auth-email-v1",message.to,message.code,message.purpose,message.expiresAt.toISOString()]))
      .digest("hex");
    let response:Response;
    try{
      response=await transport(RESEND_API,{
        method:"POST",
        headers:{
          "authorization":`Bearer ${config.apiKey.trim()}`,
          "content-type":"application/json",
          "idempotency-key":idempotencyKey,
        },
        body:JSON.stringify({
          from:config.from.trim(),
          to:[message.to],
          subject:message.purpose==="reset_password"?"UDC password recovery code":
            message.purpose==="link_phone"?"UDC WhatsApp account recovery code":
              "UDC email verification code",
          text,
        }),
        signal,
        redirect:"error",
        referrerPolicy:"no-referrer",
      });
    }catch{
      // A timeout could happen after provider acceptance. Caller invalidates
      // this code on an uncertain delivery, never automatically resending it.
      throw Error("email_delivery_unavailable");
    }
    if(!response.ok){
      await response.body?.cancel().catch(()=>undefined);
      throw Error("email_delivery_unavailable");
    }
    let payload:unknown;
    try{payload=JSON.parse(await readBoundedReceipt(response));}
    catch{throw Error("email_delivery_unavailable");}
    if(!payload||typeof payload!=="object"||Array.isArray(payload)||
      !/^[a-fA-F0-9-]{36}$/.test(String((payload as {id?:unknown}).id??""))){
      throw Error("email_delivery_unavailable");
    }
    // Provider acceptance is not proof of inbox delivery; no address, code,
    // message ID or response body is logged or returned.
  };
}
