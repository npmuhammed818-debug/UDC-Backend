import {processChannelMessage,type ConversationPorts,type ConversationPrincipal} from './conversationPort.ts';
/** Provider delivery/authentication evidence belongs to the adapter, never MIME
 * headers or text supplied by a sender. This pilot has no provider implementation. */
export type EmailEvidence={eventId:string;messageId:string;threadId:string;from:string;to:string[];cc:string[];replyTo?:string;subject:string;text:string;autoSubmitted:boolean;bulk:boolean;attachments:Array<{id:string;name:string;type:string;bytes:number}>};
export interface EmailPilotPorts{
 verifyDelivery(event:EmailEvidence):Promise<{signatureValid:boolean;dmarcAligned:boolean;authenticatedFrom:string}|null>;
 startAccountLink?(address:string):Promise<{status:string}>;
 resolveVerifiedAddress(address:string):Promise<ConversationPrincipal|null>;
 claim(messageId:string):Promise<boolean>;
 // Must be a read-only brain capability: no tool execution, deal mutation, mailbox access or sends.
 respondDraft(input:{principal:ConversationPrincipal;text:string;channel:'email';replyToProviderId?:string;executionMode:'draft_only';sourceTrust:'untrusted_email'}):Promise<string>;
 saveDraft(input:{to:string;from:string;subject:string;threadId:string;inReplyTo:string;references:string[];text:string;cc:[];attachments:[];requiresHumanReview:true}):Promise<void>;
}
export function canonicalEmail(input:string){if(input!==input.trim()||input.length>254||/[\r\n<>\s]/.test(input))return null;const m=/^([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/.exec(input);if(!m||m[1].length>64||m[1].startsWith('.')||m[1].endsWith('.')||m[1].includes('..'))return null;const labels=m[2].split('.');if(labels.length<2||labels.some(label=>!label||label.length>63||!/^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/.test(label)))return null;return m[1]+'@'+m[2].toLowerCase();}
export function safeEmailAttachment(a:EmailEvidence['attachments'][number]){return !!a.id&&a.name.length>0&&a.name.length<=180&&!/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069/\\]/u.test(a.name)&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=20*1024*1024&&['application/pdf','image/jpeg','image/png'].includes(a.type);}
/** Synthetic/manual-review pilot. No mailbox read, SMTP, provider send or attachment
 * extraction implemented. Never claims a draft was delivered. */
export async function processEmailPilot(event:EmailEvidence,ports:EmailPilotPorts,env:NodeJS.ProcessEnv=process.env){
 if(env.UDC_APP_ENV!=='staging'||env.UDC_EMAIL_PILOT_MODE!=='synthetic')return 'disabled';
 if(!event||typeof event!=='object'||Array.isArray(event)||['eventId','messageId','threadId','from','subject','text'].some(key=>typeof (event as unknown as Record<string,unknown>)[key]!=='string')||!Array.isArray(event.to)||!Array.isArray(event.cc)||[...event.to,...event.cc].some(value=>typeof value!=='string')||event.replyTo!==undefined&&typeof event.replyTo!=='string'||typeof event.autoSubmitted!=='boolean'||typeof event.bulk!=='boolean'||!Array.isArray(event.attachments)||event.attachments.some(a=>!a||typeof a!=='object'||typeof a.id!=='string'||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.bytes!=='number'))return 'invalid';
 event={...event,to:[...event.to],cc:[...event.cc],attachments:event.attachments.map(a=>({...a}))};
 const from=canonicalEmail(event.from),mailbox='udc@updowncircle.site';
 if(!from||from===mailbox||event.to.length!==1||canonicalEmail(event.to[0])!==mailbox||event.cc.length||event.replyTo&&canonicalEmail(event.replyTo)!==from)return 'audience_review_required';
 if(event.autoSubmitted||event.bulk)return 'loop_or_bulk_ignored';
 if(!event.eventId||!event.messageId||!event.threadId||[event.messageId,event.threadId,event.subject].some(v=>/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(v))||event.subject.length>180||event.text.length>6000||!event.text.trim())return 'invalid';
 const auth=await ports.verifyDelivery({...event,to:[...event.to],cc:[...event.cc],attachments:event.attachments.map(a=>({...a}))});if(!auth?.signatureValid||!auth.dmarcAligned||canonicalEmail(auth.authenticatedFrom)!==from)return 'sender_authentication_required';
 if(event.attachments.length){if(event.attachments.length>5||event.attachments.some(a=>!safeEmailAttachment(a)))return 'unsafe_attachment';return 'private_attachment_review_required';}
 if(/^link email[.!]?$/i.test(event.text.trim())&&ports.startAccountLink){if(!await ports.claim(event.messageId))return 'duplicate';const result=await ports.startAccountLink(from);return result.status==='synthetic_challenge_created'?'synthetic_link_code_created':'link_verification_unavailable';}
 let drafted=false;
 const adapted:ConversationPorts={
 resolveVerifiedBinding:async()=>{const p=await ports.resolveVerifiedAddress(from);return p?.status==='verified'?p:null;},claim:()=>ports.claim(event.messageId),
 respond:async input=>{
 if(input.principal.status!=='verified')return '';
 // Raw email is source content. The brain must not treat it, quotes or signatures
 // as platform/owner authority. Draft-only output cannot execute deal commands.
 return ports.respondDraft({...input,channel:'email',executionMode:'draft_only',sourceTrust:'untrusted_email'});
 },
 deliver:async input=>{if(!input.text.trim()||input.text.length>12000)return;
 await ports.saveDraft({to:from,from:mailbox,subject:/^re:/i.test(event.subject)?event.subject:'Re: '+event.subject,threadId:event.threadId,inReplyTo:event.messageId,references:[event.messageId],text:input.text,cc:[],attachments:[],requiresHumanReview:true});drafted=true;},
 };
 const result=await processChannelMessage({channel:'email',externalSenderId:from,providerMessageId:event.messageId,text:event.text,replyToProviderId:event.threadId},adapted);
 return result==='delivered'?(drafted?'drafted_not_sent':'no_draft'):result;
}
