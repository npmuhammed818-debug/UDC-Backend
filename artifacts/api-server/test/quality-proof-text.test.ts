import test from 'node:test';import assert from 'node:assert/strict';
import {qualityProofText} from '../src/deals/qualityProofText.ts';
test('bounded quality index preserves privacy and authenticity caveats at maximum size',()=>{
 const text=qualityProofText({dealNumber:'SYNTHETIC-001',documents:Array.from({length:100},()=>({type:'certificate_of_analysis',updatedAt:new Date('2026-11-01T00:00:00Z')})),notice:'Approval is not proof of authenticity. No files opened or shared. Current access must be checked again.'});
 assert.ok(text.length<4096);assert.match(text,/100 accessible/);assert.match(text,/88 more records omitted/);assert.match(text,/not proof of authenticity/);assert.match(text,/No files opened or shared/);assert.equal((text.match(/record updated/g)||[]).length,12);
});
test('unknown date never invents quality-record freshness',()=>{assert.match(qualityProofText({dealNumber:'TEST',documents:[{type:'product_photo',updatedAt:new Date('invalid')}],notice:'No files shared.'}),/date unavailable/);});
