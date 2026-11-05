import test from 'node:test';import assert from 'node:assert/strict';import {documentCheckText} from '../src/deals/documentCheckText.ts';import {traderDiaryText} from '../src/deals/traderDiaryText.ts';
test('shared comparison formatter returns field states, caveat and exact UTC source time only',()=>{
 const text=documentCheckText({extractionAsOf:new Date('2026-11-05T12:34:56.789Z'),checks:[{field:'unit_price',state:'not_comparable'},{field:'quantity',state:'mismatch'}],notice:'A match does not approve a document or payment.'});
 assert.match(text,/2026-11-05T12:34:56.789Z/);assert.match(text,/unit price: not comparable/);assert.match(text,/quantity: mismatch/);assert.match(text,/does not approve/);assert.match(text,/No approval or terms change made/);
});
test('shared diary formatter labels UTC recorded transitions and does not invent savings or rankings',()=>{
 const text=traderDiaryText({month:'2026-11',recordedCompletionTransitions:2,basis:'Audit records can be incomplete. Not proof of delivery.',notice:'Missing history is not zero activity.'});
 assert.match(text,/2026-11 UTC: 2 deals with a recorded transition into completed/);assert.match(text,/Not proof of delivery/);assert.match(text,/Missing history is not zero activity/);assert.match(text,/Savings and best-seller rankings are not guessed/);
});
