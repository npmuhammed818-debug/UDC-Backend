import { test } from 'node:test';
import assert from 'node:assert/strict';
import { participantConversation, violatesPrivateRelay } from '../src/akif/dealConversationPrivacy.ts';
import { conversationSafeDealMemory } from '../src/akif/dealConversationMemory.ts';
import { normalizeModelDecision } from '../src/akif/dealDecisionSafety.ts';

test('participant history exposes only their own private messages and delivered counterparty text',()=>{
  const events=[{userId:'buyer',originalText:'My private ceiling is 7900',relayed:false,relayText:null},{userId:'seller',originalText:'My private floor is 6900',relayed:false,relayText:null},{userId:'seller',originalText:'My private floor is 6900 but offer 7800',relayed:true,relayText:'I can offer 7800 per MT.'}];
  const buyer=participantConversation(events,'buyer');assert.equal(buyer.length,2);assert.match(JSON.stringify(buyer),/7900/);assert.doesNotMatch(JSON.stringify(buyer),/6900/);assert.equal(buyer[1].originalText,'I can offer 7800 per MT.');
  assert.doesNotMatch(JSON.stringify(participantConversation(events,'seller')),/7900/);
  assert.equal(events[2].originalText,'My private floor is 6900 but offer 7800');
});

test('customer memory excludes private commercial, banking and unshared document facts',()=>{
  const memory=conversationSafeDealMemory({deal:{status:'negotiation',quantity:'100',agreedPrice:'7800',buyerUserId:'PRIVATE_ID'},product:{name:'Copper'},buyerRequest:{targetPrice:'PRIVATE_LIMIT'},sellerListing:{price:'PRIVATE_FLOOR'},commissions:[{amount:'PRIVATE_FEE'}],financials:[{instrumentType:'DLC',status:'confirmed',reference:'PRIVATE_BANK_REFERENCE',metadata:{account:'PRIVATE_ACCOUNT'}}],documents:[{id:'own',uploadedBy:'buyer',status:'pending'},{id:'shared',uploadedBy:'seller',status:'approved'},{id:'hidden',uploadedBy:'seller',status:'approved'},{id:'pending',uploadedBy:'seller',status:'pending'}],documentExtractions:[{documentId:'own',status:'needs_review',structuredData:{fact:'PRIVATE_OWN_PENDING'}},{documentId:'shared',status:'completed',structuredData:{fact:'SHARED_ALLOWED'}},{documentId:'hidden',status:'completed',structuredData:{fact:'PRIVATE_DOCUMENT'}},{documentId:'pending',status:'completed',structuredData:{fact:'PRIVATE_PENDING'}}]}, {userId:'buyer',documentIds:['shared','pending'],counterpartyUserId:'seller',counterpartyDocumentIds:[]});
  const json=JSON.stringify(memory);assert.doesNotMatch(json,/PRIVATE_/);assert.match(json,/SHARED_ALLOWED/);assert.match(json,/DLC/);assert.equal(memory?.commissions.length,0);assert.equal(memory?.documents.length,2);
});

test('relay guard keeps current and historical private limits out while allowing an explicit offered price',()=>{
  const context=['Can seller do $7,800? Keep my $7,900 maximum private'];
  assert.equal(violatesPrivateRelay('Can you do USD 7800?',context),false);
  assert.equal(violatesPrivateRelay('The budget is USD 7900.',context),true);
  assert.equal(violatesPrivateRelay('Offer USD 7900.',context,'Offer USD 7900'),false);
  assert.equal(violatesPrivateRelay('Offer USD 7900.',context,'What if we offer USD 7900?'),true);
  assert.equal(violatesPrivateRelay('Contact synthetic@example.invalid',[]),true);
  assert.equal(violatesPrivateRelay('Call +971 50 123 4567',[]),true);
  assert.equal(violatesPrivateRelay('The floor is USD 0.10.', ['My private floor is $.10']),true);
});

test('actual decision normalization blocks leaked limits or contacts before delivery',()=>{
  const input={participantRole:'buyer',incomingMessage:'Can you follow up?',privateContext:['My ceiling is USD 7900; keep it private'],deal:{status:'negotiation',quantity:'100',unit:'MT',agreedPrice:'7800',currency:'USD'}};
  const decision=normalizeModelDecision({...input,content:JSON.stringify({intent:'counteroffer',replyToSender:'I’ll check.',relay:true,relayToCounterparty:'The ceiling is USD 7900.',newTradeIntake:false})});
  assert.equal(decision?.relay,false);assert.equal(decision?.relayToCounterparty,null);assert.match(decision?.replyToSender??'',/private/);
  const contacts=normalizeModelDecision({...input,content:JSON.stringify({intent:'other',replyToSender:'Contact the seller at synthetic@example.invalid',relay:false,newTradeIntake:false})});assert.equal(contacts,null);
});
