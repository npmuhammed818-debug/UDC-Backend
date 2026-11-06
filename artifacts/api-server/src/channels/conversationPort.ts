/** Transport-neutral contract. An adapter cannot prove identity by naming a user.
 * Trusted identity resolution is injected by the application, not inbound content.
 * No Telegram account, automatic account merge or transport send is provided. */
export type Channel='whatsapp'|'telegram'|'email';
export type InboundEnvelope={channel:Channel;externalSenderId:string;providerMessageId:string;text:string;replyToProviderId?:string};
export type ConversationPrincipal={userId:string;consentVersion:string;status:'verified'|'pending';role:'buyer'|'seller'|'agent'};
export interface ConversationPorts {
  resolveVerifiedBinding(input:{channel:Channel;externalSenderId:string}):Promise<ConversationPrincipal|null>;
  claim(input:{channel:Channel;providerMessageId:string}):Promise<boolean>;
  respond(input:{principal:ConversationPrincipal;text:string;replyToProviderId?:string;channel:Channel}):Promise<string>;
  deliver(input:{channel:Channel;externalRecipientId:string;replyToProviderId:string;text:string}):Promise<void>;
}
export async function processChannelMessage(input:InboundEnvelope,ports:ConversationPorts) {
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.channel!=='string'||typeof input.externalSenderId!=='string'||typeof input.providerMessageId!=='string'||typeof input.text!=='string'||input.replyToProviderId!==undefined&&typeof input.replyToProviderId!=='string'||!['whatsapp','telegram','email'].includes(input.channel)||!input.providerMessageId||!input.externalSenderId||!input.text.trim()||input.text.length>6000)return 'invalid' as const;
 input={...input};
 const resolved=await ports.resolveVerifiedBinding({channel:input.channel,externalSenderId:input.externalSenderId});
 const principal=resolved?{...resolved}:null;
 if(!principal||principal.status!=='verified'||!['buyer','seller','agent'].includes(principal.role)||typeof principal.userId!=='string'||!principal.userId.trim()||typeof principal.consentVersion!=='string'||!principal.consentVersion.trim())return 'identity_or_consent_required' as const;
 if(!await ports.claim({channel:input.channel,providerMessageId:input.providerMessageId}))return 'duplicate' as const;
 const text=await ports.respond({principal:{...principal},text:input.text,replyToProviderId:input.replyToProviderId,channel:input.channel});
 if(typeof text!=='string'||!text.trim()||text.length>12000)return 'response_unavailable' as const;
 const current=await ports.resolveVerifiedBinding({channel:input.channel,externalSenderId:input.externalSenderId});
 if(!current||current.status!=='verified'||current.userId!==principal.userId||current.role!==principal.role||current.consentVersion!==principal.consentVersion)return 'binding_changed_not_delivered' as const;
 await ports.deliver({channel:input.channel,externalRecipientId:input.externalSenderId,replyToProviderId:input.providerMessageId,text});
 return 'delivered' as const;
}
