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

test('stable account history has one key across transports and separates accounts',async()=>{
 const {accountHistoryKey,resolveHistoryIdentity}=await import('../src/channels/historyIdentity.ts');
 const secret='synthetic-secret-long-enough';
 const resolver=async(c:string,s:string)=>c==='whatsapp'&&s==='phone-a'||c==='telegram'&&s==='telegram-a'?'account-a':null;
 const a=await resolveHistoryIdentity('whatsapp','phone-a',resolver,secret),b=await resolveHistoryIdentity('telegram','telegram-a',resolver,secret);
 assert.ok(a);assert.ok(b);assert.equal(a.key,b.key);assert.notEqual(a.key,accountHistoryKey('account-b',secret));
 assert.equal(await resolveHistoryIdentity('telegram','phone-a',resolver,secret),null);
});

test('transport-neutral port refuses pending or revoked identities before delivery',async()=>{
 const msg={channel:'whatsapp' as const,externalSenderId:'verified-phone',providerMessageId:'synthetic-id',text:'status'};
 let pending=false,revoked=false,calls=0,sends=0;const ports:ConversationPorts={resolveVerifiedBinding:async()=>revoked?null:{userId:'verified-user',status:pending?'pending':'verified',role:'buyer',consentVersion:'v1'},claim:async()=>{calls++;return true;},respond:async()=>{revoked=true;return 'Private response';},deliver:async()=>{sends++;}};
 pending=true;assert.equal(await processChannelMessage(msg,ports),'identity_or_consent_required');assert.equal(calls,0);pending=false;assert.equal(await processChannelMessage(msg,ports),'binding_changed_not_delivered');assert.equal(sends,0);
});
test('transport-neutral port refuses blank or oversized response instead of claiming delivery',async()=>{
 const msg={channel:'email' as const,externalSenderId:'buyer@example.invalid',providerMessageId:'id',text:'status'};let sends=0;
 const ports:ConversationPorts={resolveVerifiedBinding:async()=>({userId:'verified-user',status:'verified',role:'buyer',consentVersion:'v1'}),claim:async()=>true,respond:async()=>'',deliver:async()=>{sends++;}};
 assert.equal(await processChannelMessage(msg,ports),'response_unavailable');ports.respond=async()=>'x'.repeat(12001);assert.equal(await processChannelMessage(msg,ports),'response_unavailable');assert.equal(sends,0);
});
test('transport-neutral port does not deliver after account, role or consent version changes',async()=>{
 const msg={channel:'whatsapp' as const,externalSenderId:'verified-phone',providerMessageId:'id',text:'status'};let sends=0;
 for(const patch of [{userId:'other-user'},{role:'seller' as const},{consentVersion:'v2'},{status:'pending' as const}]){let reads=0;const original={userId:'verified-user',status:'verified' as const,role:'buyer' as const,consentVersion:'v1'};const ports:ConversationPorts={resolveVerifiedBinding:async()=>++reads===1?original:{...original,...patch},claim:async()=>true,respond:async()=>'Private response',deliver:async()=>{sends++;}};assert.equal(await processChannelMessage(msg,ports),'binding_changed_not_delivered');}assert.equal(sends,0);
});
