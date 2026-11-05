import test from 'node:test';import assert from 'node:assert/strict';
import {tradeAssistStatusText} from '../src/deals/tradeAssistStatusText.ts';
test('maximum private status notes leave room for queue-only caveat and transport suffix',()=>{
 const text=tradeAssistStatusText('D'.repeat(500),Array.from({length:6},()=>({kind:'backup seller',status:'resolved',note:'N'.repeat(1000)})));
 assert.ok(text.length+100<4096);assert.equal((text.match(/backup seller/g)||[]).length,5);assert.match(text,/note shortened/);assert.match(text,/Recorded queue status only/);assert.match(text,/physically resolved/);assert.match(text,/agreement has changed/);
});
test('empty status says no request recorded without promising contact',()=>{assert.match(tradeAssistStatusText('SYNTHETIC',[]),/No help requests recorded for you/);});
