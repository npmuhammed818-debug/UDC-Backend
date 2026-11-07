import {test} from 'node:test';import assert from 'node:assert/strict';import {processEmailPilot,canonicalEmail,safeEmailAttachment,type EmailEvidence,type EmailPilotPorts} from '../src/channels/emailPilot.ts';import {accountHistoryKey} from '../src/channels/historyIdentity.ts';
test('email pilot shares verified account seam but drafts only to exact authenticated sender',async()=>{
 const event:EmailEvidence={eventId:'synthetic-event',messageId:'synthetic-message',threadId:'synthetic-thread',from:'buyer@example.com',to:['udc@updowncircle.site'],cc:[],subject:'Synthetic sugar request',text:'Need 10 MT sugar',autoSubmitted:false,bulk:false,attachments:[]};let drafts:any[]=[],calls=0;const claimed=new Set();const p:EmailPilotPorts={verifyDelivery:async()=>({signatureValid:true,dmarcAligned:true,authenticatedFrom:event.from}),resolveVerifiedAddress:async address=>{assert.equal(address,event.from);return {userId:'verified-user',consentVersion:'v1',status:'verified',role:'buyer'};},claim:async id=>{if(claimed.has(id))return false;claimed.add(id);return true;},respondDraft:async x=>{calls++;assert.equal(x.channel,'email');assert.equal(x.executionMode,'draft_only');assert.equal(x.sourceTrust,'untrusted_email');assert.equal(x.principal.userId,'verified-user');return 'Synthetic draft response, no order made.';},saveDraft:async d=>{drafts.push(d);}};
 const env={UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'};assert.equal(await processEmailPilot(event,p,env),'drafted_not_sent');assert.equal(drafts.length,1);assert.equal(drafts[0].to,event.from);assert.deepEqual(drafts[0].cc,[]);assert.equal(drafts[0].requiresHumanReview,true);assert.equal(await processEmailPilot(event,p,env),'duplicate');assert.equal(calls,1);assert.equal(await processEmailPilot(event,p,{}),'disabled');
 assert.equal(await processEmailPilot({...event,replyTo:'other@example.com'},p,env),'audience_review_required');assert.equal(await processEmailPilot({...event,cc:['other@example.com']},p,env),'audience_review_required');assert.equal(await processEmailPilot({...event,autoSubmitted:true},p,env),'loop_or_bulk_ignored');
 assert.equal(await processEmailPilot({...event,messageId:'auth-failed'},{...p,verifyDelivery:async()=>({signatureValid:true,dmarcAligned:false,authenticatedFrom:event.from})},env),'sender_authentication_required');
 assert.equal(await processEmailPilot({...event,messageId:'unknown'},{...p,resolveVerifiedAddress:async()=>null},env),'identity_or_consent_required');
 assert.equal(await processEmailPilot({...event,attachments:[{id:'doc',name:'invoice.pdf',type:'application/pdf',bytes:12}]},p,env),'private_attachment_review_required');assert.equal(drafts.length,1);
 assert.equal(accountHistoryKey('verified-user','x'.repeat(32)),accountHistoryKey('verified-user','x'.repeat(32)));
});
test('email address and attachment safety never strips plus tags or accepts header injection',()=>{assert.equal(canonicalEmail('Buyer+Trade@EXAMPLE.COM'),'Buyer+Trade@example.com');assert.equal(canonicalEmail('buyer@example.com\r\nBcc: attacker@x.com'),null);assert.equal(safeEmailAttachment({id:'a',name:'../x.pdf',type:'application/pdf',bytes:1}),false);assert.equal(safeEmailAttachment({id:'a',name:'x.html',type:'text/html',bytes:1}),false);});

test('link enrollment requires authenticated single-recipient email before any code generation',async()=>{let starts=0;const event:EmailEvidence={eventId:'enroll',messageId:'enroll',threadId:'enroll',from:'registered@example.com',to:['udc@updowncircle.site'],cc:[],subject:'Link request',text:'link email',autoSubmitted:false,bulk:false,attachments:[]};const ports:EmailPilotPorts={verifyDelivery:async()=>({signatureValid:true,dmarcAligned:true,authenticatedFrom:event.from}),startAccountLink:async a=>{assert.equal(a,event.from);starts++;return {status:'synthetic_challenge_created'};},resolveVerifiedAddress:async()=>null,claim:async()=>true,respondDraft:async()=>{throw Error('no model');},saveDraft:async()=>{throw Error('no draft or send');}};const env={UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'};assert.equal(await processEmailPilot(event,ports,env),'synthetic_link_code_created');assert.equal(starts,1);assert.equal(await processEmailPilot({...event,cc:['other@example.com']},ports,env),'audience_review_required');assert.equal(await processEmailPilot(event,{...ports,verifyDelivery:async()=>null},env),'sender_authentication_required');assert.equal(starts,1);});

test('email attachment sizes must be finite positive whole bytes',()=>{
 for(const bytes of [0.5,1.5,NaN,Infinity,-Infinity,0,-1])assert.equal(safeEmailAttachment({id:'synthetic',name:'invoice.pdf',type:'application/pdf',bytes}),false,String(bytes));
 assert.equal(safeEmailAttachment({id:'synthetic',name:'invoice.pdf',type:'application/pdf',bytes:1}),true);
});

test('email canonicalization refuses malformed dot-atoms and domain labels',()=>{
 for(const address of ['.buyer@example.com','buyer.@example.com','buy..er@example.com','buyer@example..com','buyer@-example.com','buyer@example-.com','buyer@exam_ple.com','buyer@a.'+'x'.repeat(64)])assert.equal(canonicalEmail(address),null,address);
 assert.equal(canonicalEmail('Buyer+tag@sub.EXAMPLE.COM'),'Buyer+tag@sub.example.com');
});

test('attachment labels refuse controls and direction overrides before private review',()=>{
 for(const name of ['invoice\u0000.pdf','invoice\u2028.pdf','invoice\u202eexe.pdf','invoice\u2066.pdf','invoice\u0085.pdf'])assert.equal(safeEmailAttachment({id:'synthetic',name,type:'application/pdf',bytes:1}),false,JSON.stringify(name));
 assert.equal(safeEmailAttachment({id:'synthetic',name:'invoice 2026.pdf',type:'application/pdf',bytes:1}),true);
});

test('email draft headers reject control characters and Unicode direction tricks',async()=>{
 const event:EmailEvidence={eventId:'synthetic',messageId:'message',threadId:'thread',from:'buyer@example.com',to:['udc@updowncircle.site'],cc:[],subject:'Trade request',text:'deal status',autoSubmitted:false,bulk:false,attachments:[]};let calls=0;const ports:EmailPilotPorts={verifyDelivery:async()=>{calls++;return null;},resolveVerifiedAddress:async()=>null,claim:async()=>false,respondDraft:async()=>'',saveDraft:async()=>{}};
 for(const field of ['subject','messageId','threadId'] as const)for(const bad of ['bad\u0000value','bad\u2028value','bad\u202evalue'])assert.equal(await processEmailPilot({...event,[field]:bad},ports,{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'}),'invalid',field);
 assert.equal(calls,0);
});

test('malformed runtime email envelopes fail closed before any external port',async()=>{
 const event:EmailEvidence={eventId:'event',messageId:'message',threadId:'thread',from:'buyer@example.com',to:['udc@updowncircle.site'],cc:[],subject:'Trade',text:'status',autoSubmitted:false,bulk:false,attachments:[]};let calls=0;const ports:EmailPilotPorts={verifyDelivery:async()=>{calls++;return null;},resolveVerifiedAddress:async()=>null,claim:async()=>false,respondDraft:async()=>'',saveDraft:async()=>{}};
 for(const input of [null,undefined,{},[],{...event,from:123},{...event,to:null},{...event,to:[42]},{...event,cc:'none'},{...event,text:null},{...event,attachments:null},{...event,attachments:[null]},{...event,autoSubmitted:'false'},{...event,bulk:undefined}])assert.equal(await processEmailPilot(input as never,ports,{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'}),'invalid');
 assert.equal(calls,0);
});

import {processChannelMessage,type ConversationPorts} from '../src/channels/conversationPort.ts';
test('channel-neutral boundary refuses malformed runtime envelopes before identity resolution',async()=>{
 const valid={channel:'email',externalSenderId:'synthetic@example.com',providerMessageId:'message',text:'hello'};let calls=0;const ports:ConversationPorts={resolveVerifiedBinding:async()=>{calls++;return null;},claim:async()=>false,respond:async()=>'',deliver:async()=>{}};
 for(const input of [null,{},[],{...valid,text:null},{...valid,text:42},{...valid,externalSenderId:42},{...valid,providerMessageId:{}},{...valid,replyToProviderId:42}])assert.equal(await processChannelMessage(input as never,ports),'invalid');
 assert.equal(calls,0);
});

test('email draft retains validated headers despite caller or verifier mutation',async()=>{
 for(const mutateVerifier of [false,true]){
 const event:EmailEvidence={eventId:'event',messageId:'original-message',threadId:'original-thread',from:'buyer@example.com',to:['udc@updowncircle.site'],cc:[],subject:'Original subject',text:'history',autoSubmitted:false,bulk:false,attachments:[]};let saved:any;
 const ports:EmailPilotPorts={verifyDelivery:async received=>{if(mutateVerifier){received.subject='bad\r\nBcc: other@example.com';received.messageId='other-message';received.to.push('other@example.com');}return {signatureValid:true,dmarcAligned:true,authenticatedFrom:'buyer@example.com'};},resolveVerifiedAddress:async()=>({userId:'original',role:'buyer',status:'verified',consentVersion:'v1'}),claim:async id=>{assert.equal(id,'original-message');return true;},respondDraft:async()=>{event.subject='bad\r\nBcc: other@example.com';event.threadId='other-thread';return 'Synthetic private history';},saveDraft:async draft=>{saved=draft;}};
 assert.equal(await processEmailPilot(event,ports,{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'}),'drafted_not_sent');assert.equal(saved.subject,'Re: Original subject');assert.equal(saved.threadId,'original-thread');assert.equal(saved.inReplyTo,'original-message');assert.equal(saved.to,'buyer@example.com');
 }
});

test('delivery authentication needs true booleans and a string authenticated address',async()=>{
 const event:EmailEvidence={eventId:'event',messageId:'message',threadId:'thread',from:'buyer@example.com',to:['udc@updowncircle.site'],cc:[],subject:'Trade',text:'history',autoSubmitted:false,bulk:false,attachments:[]};let calls=0;
 for(const auth of [{signatureValid:'false',dmarcAligned:true,authenticatedFrom:event.from},{signatureValid:true,dmarcAligned:'false',authenticatedFrom:event.from},{signatureValid:1,dmarcAligned:1,authenticatedFrom:event.from},{signatureValid:true,dmarcAligned:true,authenticatedFrom:null}]){
 const ports:EmailPilotPorts={verifyDelivery:async()=>auth as never,resolveVerifiedAddress:async()=>{calls++;return null;},claim:async()=>{calls++;return true;},respondDraft:async()=>'',saveDraft:async()=>{calls++;}};
 assert.equal(await processEmailPilot(event,ports,{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'}),'sender_authentication_required');
 }assert.equal(calls,0);
});

test('email canonicalization rejects nonstring runtime values without coercion or throwing',()=>{
 for(const value of [null,undefined,42,{},[],['buyer@example.com'],true])assert.equal(canonicalEmail(value as never),null);
});
