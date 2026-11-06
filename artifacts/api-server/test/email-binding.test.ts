import {test} from 'node:test';import assert from 'node:assert/strict';import {timingSafeEqual} from 'node:crypto';import {emailBindingService,type EmailLinkChallenge} from '../src/channels/emailBinding.ts';
test('registered email binds only through current verified WhatsApp user and single-use expiring budgeted code',async()=>{
 let now=1000,code='',bound='',challenge:EmailLinkChallenge|undefined;const p={findRegisteredAccount:async(address:string)=>address==='registered@example.com'?{userId:'account-1',address,verified:true,consentVersion:'v1'}:null,reserve:async(c:EmailLinkChallenge)=>{if(challenge)return false;challenge=c;return true;},putWhatsAppCodeInSyntheticSink:async(u:string,c:string)=>{assert.equal(u,'account-1');code=c;},consumeAndBind:async(id:string,u:string,h:string,n:number)=>{if(!challenge||challenge.id!==id||challenge.userId!==u||challenge.expiresAt<=n||challenge.attempts>=5)return false;challenge.attempts++;if(!timingSafeEqual(Buffer.from(challenge.codeHash),Buffer.from(h)))return false;bound=challenge.address;challenge=undefined;return true;}};
 const service=emailBindingService(p,'s'.repeat(40),{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'},()=>now);
 assert.equal((await service.startFromAuthenticatedEmail('other@example.com')).status,'verification_unavailable');assert.equal(code,'');const c=await service.startFromAuthenticatedEmail('registered@example.com');assert.equal(c.status,'synthetic_challenge_created');assert.match(code,/^\d{6}$/);assert.notEqual(challenge!.codeHash,code);assert.equal(await service.confirmFromVerifiedWhatsApp(c.challengeId!,code,'wrong-user'),false);assert.equal(bound,'');assert.equal(await service.confirmFromVerifiedWhatsApp(c.challengeId!,code,'account-1'),true);assert.equal(bound,'registered@example.com');assert.equal(await service.confirmFromVerifiedWhatsApp(c.challengeId!,code,'account-1'),false);
 const expired=await service.startFromAuthenticatedEmail('registered@example.com');now+=120001;assert.equal(await service.confirmFromVerifiedWhatsApp(expired.challengeId!,code,'account-1'),false);
});

test('link enrollment refuses malformed account evidence before reserving or producing a code',async()=>{
 const valid={userId:'synthetic-user',address:'registered@example.com',verified:true,consentVersion:'v1'};let writes=0;
 for(const account of [{...valid,verified:'false'},{...valid,userId:42},{...valid,userId:' '},{...valid,consentVersion:{}},{...valid,consentVersion:' '},{...valid,address:null}]){
 const service=emailBindingService({findRegisteredAccount:async()=>account as never,reserve:async()=>{writes++;return true;},consumeAndBind:async()=>{writes++;return true;},putWhatsAppCodeInSyntheticSink:async()=>{writes++;}},'s'.repeat(40),{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'});
 assert.equal((await service.startFromAuthenticatedEmail(valid.address)).status,'verification_unavailable');
 }assert.equal(writes,0);
});

test('link code recipient remains the resolved account even when its shared object changes',async()=>{
 const account={userId:'original-user',address:'registered@example.com',verified:true,consentVersion:'v1'};let recipient='';
 const service=emailBindingService({findRegisteredAccount:async()=>account,reserve:async challenge=>{assert.equal(challenge.userId,'original-user');account.userId='other-user';return true;},consumeAndBind:async()=>false,putWhatsAppCodeInSyntheticSink:async user=>{recipient=user;}},'s'.repeat(40),{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'});
 assert.equal((await service.startFromAuthenticatedEmail(account.address)).status,'synthetic_challenge_created');assert.equal(recipient,'original-user');
});

test('link confirmation refuses coerced runtime identifiers and codes before consuming',async()=>{
 let consumes=0;const service=emailBindingService({findRegisteredAccount:async()=>null,reserve:async()=>false,consumeAndBind:async()=>{consumes++;return true;},putWhatsAppCodeInSyntheticSink:async()=>{}},'s'.repeat(40),{UDC_APP_ENV:'staging',UDC_EMAIL_PILOT_MODE:'synthetic'});const id='11111111-1111-4111-8111-111111111111';
 for(const args of [[id,123456,'synthetic'],[id,'123456',42],[id,'123456',' '],['-'.repeat(36),'123456','synthetic'],[[id],'123456','synthetic'],[id,['123456'],'synthetic']])assert.equal(await service.confirmFromVerifiedWhatsApp(...args as [never,never,never]),false);
 assert.equal(consumes,0);
});
