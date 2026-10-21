import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
export type FlowPurpose='profile_buyer'|'profile_seller'|'profile_agent'|'buyer'|'seller';
const purposes:FlowPurpose[]=['profile_buyer','profile_seller','profile_agent','buyer','seller'];
function secret(){const key=process.env.WHATSAPP_APP_SECRET;if(!key||key.length<16)throw new Error('flow_signing_unavailable');return key;}
const hmac=(value:string)=>createHmac('sha256',secret()).update('UDC_CHAT_FLOW_V1\0'+value).digest('base64url');
export function issueFlowToken(phone:string,purpose:FlowPurpose,nonce:string=randomUUID()){const payload={purpose,nonce,sub:hmac(phone),exp:Date.now()+30*60_000};const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return body+'.'+hmac(body);}
export function readFlowToken(token:unknown,phone:string){
  if(typeof token!=='string'||token.length>650)return null;
  try{const [body,signature,...extra]=token.split('.');if(extra.length||!body||!signature)return null;const expected=hmac(body);if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
    const data=JSON.parse(Buffer.from(body,'base64url').toString());if(!purposes.includes(data.purpose)||data.sub!==hmac(phone)||!Number.isFinite(data.exp)||data.exp<Date.now()||data.exp>Date.now()+31*60_000||typeof data.nonce!=='string'||! /^[a-f0-9-]{36}$/.test(data.nonce))return null;
    return data as {purpose:FlowPurpose;nonce:string;sub:string;exp:number};
  }catch{return null;}
}
