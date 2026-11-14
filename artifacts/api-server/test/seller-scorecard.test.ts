import {test} from 'node:test';import assert from 'node:assert/strict';import {sellerResponseSummary} from '../src/tradeEducation/scorecard.ts';
test('scorecard groups inbound turns by deal, preserves unanswered and month boundaries',()=>{
 const row=(dealId:string,sender:string,receiver:string,date:string)=>({dealId,sender,receiver,at:new Date(date)}),start=new Date('2026-11-01T00:00Z'),end=new Date('2026-12-01T00:00Z');
 const r=sellerResponseSummary([row('a','b','s','2026-11-03T00:00Z'),row('a','b','s','2026-11-03T00:10Z'),row('a','s','b','2026-11-03T01:00Z'),row('b','b','s','2026-11-03T02:00Z'),row('c','s','b','2026-11-03T02:10Z'),row('z','b','s','2026-10-31T23:00Z')],'s',start,end);assert.equal(r.medianReplyMinutes,60);assert.equal(r.inboundTurns,2);assert.equal(r.answeredTurns,1);assert.equal(r.unansweredTurns,1);
 assert.equal(sellerResponseSummary([],'s',start,end).medianReplyMinutes,null);
});

test('equal-timestamp inbound and seller reply never invent a proven response order',()=>{
 const start=new Date('2026-11-01T00:00Z'),end=new Date('2026-12-01T00:00Z'),at=new Date('2026-11-03T12:00Z');
 const inbound={dealId:'a',sender:'b',receiver:'s',at},outbound={dealId:'a',sender:'s',receiver:'b',at};
 for(const rows of [[inbound,outbound],[outbound,inbound]]){
  const r=sellerResponseSummary(rows,'s',start,end);assert.equal(r.answeredTurns,0);assert.equal(r.unansweredTurns,1);assert.equal(r.medianReplyMinutes,null);
 }
});

test('timestamp ties preserve older unanswered turns and allow a later proven reply',()=>{
 const start=new Date('2026-11-01T00:00Z'),end=new Date('2026-12-01T00:00Z');
 const old={dealId:'a',sender:'b',receiver:'s',at:new Date('2026-11-03T11:00Z')},inbound={dealId:'a',sender:'b',receiver:'s',at:new Date('2026-11-03T12:00Z')},outbound={dealId:'a',sender:'s',receiver:'b',at:inbound.at},later={...outbound,at:new Date('2026-11-03T13:00Z')};
 for(const tied of [[inbound,outbound],[outbound,inbound]]){
  const r=sellerResponseSummary([old,...tied],'s',start,end);assert.equal(r.inboundTurns,2);assert.equal(r.answeredTurns,1);assert.equal(r.unansweredTurns,1);assert.equal(r.medianReplyMinutes,60);
  const completed=sellerResponseSummary([old,...tied,later],'s',start,end);assert.equal(completed.answeredTurns,2);assert.equal(completed.unansweredTurns,0);assert.equal(completed.medianReplyMinutes,60);
 }
});
