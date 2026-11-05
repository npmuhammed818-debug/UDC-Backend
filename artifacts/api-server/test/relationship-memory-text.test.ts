import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relationshipMemoryText} from '../src/deals/relationshipMemoryText.ts';
test('shared same-party history text preserves recorded-count and no-inference boundaries',()=>{
 const text=relationshipMemoryText({dealNumber:'UDC-SYNTHETIC',priorRecordedDeals:3,priorRecordedCompletions:1,notice:'Missing audit history is not zero activity. A recorded completion does not prove timely delivery, payment, product quality or reliability. No prior messages, documents, prices, identities or private exit reasons are shown.'});
 assert.match(text,/UDC-SYNTHETIC: 3 prior recorded deals with this same party; 1 with a recorded completion transition/);
 assert.match(text,/Missing audit history is not zero activity/);
 assert.match(text,/does not prove timely delivery, payment, product quality or reliability/);
 assert.match(text,/No prior messages, documents, prices, identities or private exit reasons/);
});
