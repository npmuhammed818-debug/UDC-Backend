import {createHmac,randomInt,randomUUID} from 'node:crypto';
import {canonicalEmail} from './emailPilot.ts';
export type EmailLinkChallenge={id:string;userId:string;address:string;codeHash:string;expiresAt:number;attempts:number};
export interface EmailLinkPorts{
 // Current registration source, never userId/phone supplied by inbound email.
 findRegisteredAccount(address:string):Promise<{userId:string;address:string;verified:boolean;consentVersion:string}|null>;
 // Atomic store with recipient/address rate budgets and max-five single-use consume.
 reserve(challenge:EmailLinkChallenge,now:number):Promise<boolean>;
 consumeAndBind(id:string,userId:string,codeHash:string,now:number):Promise<boolean>;
 // Hard synthetic sink. No provider send implementation in this module.
 putWhatsAppCodeInSyntheticSink(userId:string,code:string,challengeId:string):Promise<void>;
}
export function emailBindingService(ports:EmailLinkPorts,secret:string,env:NodeJS.ProcessEnv=process.env,clock=()=>Date.now()){
 if(secret.length<32)throw Error('email_binding_secret_required');const enabled=()=>env.UDC_APP_ENV==='staging'&&env.UDC_EMAIL_PILOT_MODE==='synthetic';
 const hash=(id:string,code:string)=>createHmac('sha256',secret).update('UDC_EMAIL_BINDING_V1\0'+id+'\0'+code).digest('hex');
 return {
 async startFromAuthenticatedEmail(address:string){
 if(!enabled())return {status:'disabled'};const canonical=canonicalEmail(address);if(!canonical)return {status:'verification_unavailable'};
 const resolved=await ports.findRegisteredAccount(canonical),account=resolved?{...resolved}:null;if(account?.verified!==true||typeof account.userId!=='string'||!account.userId.trim()||typeof account.consentVersion!=='string'||!account.consentVersion.trim()||typeof account.address!=='string'||canonicalEmail(account.address)!==canonical)return {status:'verification_unavailable'};
 const id=randomUUID(),code=String(randomInt(1000000)).padStart(6,'0'),now=clock();
 if(await ports.reserve({id,userId:account.userId,address:canonical,codeHash:hash(id,code),expiresAt:now+120000,attempts:0},now)!==true)return {status:'rate_limited'};
 await ports.putWhatsAppCodeInSyntheticSink(account.userId,code,id);return {status:'synthetic_challenge_created',challengeId:id};
 },
 // Caller must establish current WhatsApp account identity independently. The code
 // is entered on that WhatsApp account, never accepted from an arbitrary email.
 async confirmFromVerifiedWhatsApp(id:string,code:string,verifiedUserId:string){
 if(!enabled()||typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)||typeof code!=='string'||!/^\d{6}$/.test(code)||typeof verifiedUserId!=='string'||!verifiedUserId.trim())return false;
 return await ports.consumeAndBind(id,verifiedUserId,hash(id,code),clock())===true;
 }
 };
}
