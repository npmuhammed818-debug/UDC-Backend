import {test} from 'node:test';import assert from 'node:assert/strict';import {sellerResponseSummary} from '../src/tradeEducation/scorecard.ts';
test('scorecard groups inbound turns by deal, preserves unanswered and month boundaries',()=>{
 const row=(dealId:string,sender:string,receiver:string,date:string)=>({dealId,sender,receiver,at:new Date(date)}),start=new Date('2026-11-01T00:00Z'),end=new Date('2026-12-01T00:00Z');
 const r=sellerResponseSummary([row('a','b','s','2026-11-03T00:00Z'),row('a','b','s','2026-11-03T00:10Z'),row('a','s','b','2026-11-03T01:00Z'),row('b','b','s','2026-11-03T02:00Z'),row('c','s','b','2026-11-03T02:10Z'),row('z','b','s','2026-10-31T23:00Z')],'s',start,end);assert.equal(r.medianReplyMinutes,60);assert.equal(r.inboundTurns,2);assert.equal(r.answeredTurns,1);assert.equal(r.unansweredTurns,1);
 assert.equal(sellerResponseSummary([],'s',start,end).medianReplyMinutes,null);
});
