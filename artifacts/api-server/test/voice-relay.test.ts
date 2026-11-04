import {test} from 'node:test';import assert from 'node:assert/strict';import {confirmedVoiceRelay,pendingVoiceRelay} from '../src/deals/voiceRelay.ts';
test('voice release requires exact typed confirmation bound to a preview event',()=>{
 const id='11111111-1111-4111-8111-111111111111',ctx='voice_relay_preview:'+id;assert.equal(confirmedVoiceRelay('CONFIRM VOICE RELAY',false,ctx),id);for(const [text,audio,context]of [['yes',false,ctx],['CONFIRM VOICE RELAY',true,ctx],['CONFIRM VOICE RELAY',false,'other:'+id],['CONFIRM VOICE RELAY',false,undefined]]as const)assert.equal(confirmedVoiceRelay(text,audio,context),null);
});
test('only nonbinding privacy-safe relay text gets a confirmable voice preview',()=>{
 assert.equal(pendingVoiceRelay('question',true,'When can loading start?'),true);for(const text of ['Price is $500','Buyer accepts','Email me here','Pay the bank','New offer','https://example.invalid','quantity 20'])assert.equal(pendingVoiceRelay('clarification',true,text),false,text);for(const intent of ['acceptance','rejection','counteroffer','unknown'])assert.equal(pendingVoiceRelay(intent,true,'Please proceed'),false,intent);
});
