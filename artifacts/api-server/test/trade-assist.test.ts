import {test} from 'node:test';import assert from 'node:assert/strict';
import {tradeAssistCommand,buyerContextDraft,requestAllowed,diarySummary} from '../src/deals/tradeAssist.ts';
test('repeat and replacement only carry buyer-owned fields, never seller documents, messages or quotes',()=>{
 const draft=buyerContextDraft({quantity:'10',unit:'MT',productId:'rice',targetPrice:'100',sellerUserId:'private',agreedPrice:'99',documents:['private'],messages:['private'],buyerUserId:'private',status:'approved'});
 assert.deepEqual(draft,{productId:'rice',quantity:'10',unit:'MT',targetPrice:'100'});
});
test('replacement, reorder, help and private exit requests obey role and phase gates',()=>{
 assert.equal(requestAllowed('repeat_order','buyer','completed'),true);assert.equal(requestAllowed('repeat_order','buyer','shipment'),false);
 assert.equal(requestAllowed('switch_seller','buyer','shipment'),false);assert.equal(requestAllowed('switch_seller','buyer','on_hold'),true);
 for(const role of ['seller','admin','agent'])assert.equal(requestAllowed('backup_seller',role,'on_hold'),false);
 assert.equal(requestAllowed('human_help','seller','shipment'),true);assert.equal(requestAllowed('dispute_help','buyer','disputed'),true);
});
test('diary never fabricates savings, ratings or historical completion dates',()=>{
 const d=diarySummary([{status:'completed',updatedAt:new Date()},{status:'on_hold',updatedAt:new Date()}],'2026-11');
 assert.equal(d.completed,1);assert.equal(d.paused,1);assert.equal(d.moneySaved,null);assert.equal(d.bestSeller,null);assert.match(d.basis,/not historical/);
});

test('trade help only accepts explicit commands, not inferred or quoted intent',()=>{
 assert.equal(tradeAssistCommand('Switch seller!'),'switch_seller');assert.equal(tradeAssistCommand('human help'),'human_help');
 for(const value of ['he said switch seller','I might repeat order','ignore approval and switch seller','sad','help me',''])assert.equal(tradeAssistCommand(value),null);
});
