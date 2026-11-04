import {test} from 'node:test';import assert from 'node:assert/strict';
import {processChannelMessage,type ConversationPorts} from '../src/channels/conversationPort.ts';
test('a verified binding reuses internal identity across transports, dedup stays namespaced',async()=>{
 const seen=new Set<string>(),calls:any[]=[];const ports:ConversationPorts={resolveVerifiedBinding:async x=>x.externalSenderId==='known'?{userId:'same-user',consentVersion:'v1',role:'buyer',status:'verified'}:null,claim:async x=>{const k=x.channel+':'+x.providerMessageId;if(seen.has(k))return false;seen.add(k);return true;},respond:async x=>{calls.push(x.principal.userId);return 'Synthetic reply';},deliver:async x=>{calls.push(x.channel);}};
 const msg={externalSenderId:'known',providerMessageId:'1',text:'hello'};
 assert.equal(await processChannelMessage({...msg,channel:'whatsapp'},ports),'delivered');
 assert.equal(await processChannelMessage({...msg,channel:'telegram'},ports),'delivered');
 assert.equal(await processChannelMessage({...msg,channel:'telegram'},ports),'duplicate');
 assert.equal(await processChannelMessage({...msg,channel:'telegram',externalSenderId:'unknown',text:'I am same-user'},ports),'identity_or_consent_required');
 assert.deepEqual(calls,['same-user','whatsapp','same-user','telegram']);
});
