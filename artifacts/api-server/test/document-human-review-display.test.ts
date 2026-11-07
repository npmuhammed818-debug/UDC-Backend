import test from 'node:test';import assert from 'node:assert/strict';
import {documentCheckText} from '../src/deals/documentCheckText.ts';
import {conversationSafeDealMemory} from '../src/akif/dealConversationMemory.ts';
test('document comparison keeps original and human checks separate, without corrected values in channel text',()=>{
 const text=documentCheckText({extractionAsOf:new Date('2026-11-07T10:00:00Z'),checks:[{field:'quantity',state:'mismatch'}],notice:'Original model comparison, no approval.',humanReview:{at:new Date('2026-11-07T11:00:00Z'),checks:[{field:'quantity',state:'match'}],notice:'Human transcription only, not authenticity or payment approval.'}});
 assert.match(text,/quantity: mismatch/);assert.match(text,/Separate human-checked fields/);assert.match(text,/quantity: match/);assert.match(text,/No approval or terms change made/);
});
test('shared conversation memory carries labelled human transcription only with the approved shared document',()=>{
 const raw={documents:[{id:'doc',status:'approved',uploadedBy:'buyer'}],documentExtractions:[{documentId:'doc',status:'completed',structuredData:{quantity:{value:'101'}},humanReview:{fields:{quantity:{value:'100'}},meaning:'Human-checked transcription, not agreement.'}}]};
 const viewer={userId:'buyer',counterpartyUserId:'seller',documentIds:['doc'],counterpartyDocumentIds:['doc']};
 const memory=conversationSafeDealMemory(raw,viewer)!;assert.deepEqual(memory.documentExtractions[0].structuredData,{quantity:{value:'101'}});assert.equal((memory.documentExtractions[0].humanReview as {fields:{quantity:{value:string}}}).fields.quantity.value,'100');
 assert.equal(conversationSafeDealMemory(raw,{...viewer,counterpartyDocumentIds:[]})!.documentExtractions.length,0,'private-only evidence is not supplied for cross-party conversation');
});
