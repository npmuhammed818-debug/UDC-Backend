import {createHmac} from 'node:crypto';
export type StableConversationIdentity={userId:string;channel:'whatsapp'|'telegram'|'email';externalSenderId:string};
/** The resolver must establish binding from provider-authenticated sender data.
 * The same verified account gets the same history key on either channel.
 * Never accept a userId from inbound text or combine accounts by name. */
export function accountHistoryKey(userId:string,secret:string){
 if(typeof userId!=='string'||!userId.trim()||typeof secret!=='string'||secret.length<16)throw Error('history_identity_unavailable');
 return createHmac('sha256',secret).update('UDC_ACCOUNT_HISTORY_V1\0'+userId).digest('hex');
}
export async function resolveHistoryIdentity(channel:'whatsapp'|'telegram'|'email',externalSenderId:string,resolve:(channel:'whatsapp'|'telegram'|'email',sender:string)=>Promise<string|null>,secret:string){
 const userId=await resolve(channel,externalSenderId);
 return typeof userId==='string'&&userId.trim()?{userId,key:accountHistoryKey(userId,secret)}:null;
}
