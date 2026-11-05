import {test} from 'node:test';import assert from 'node:assert/strict';import {counterCoachCommand,counterCoach} from '../src/tradeEducation/coach.ts';
test('coach never chooses a price or guesses private seller margin',()=>{
 const input=counterCoachCommand('coach counter 95 USD');assert.deepEqual(input,{amount:'95',currency:'USD'});const deal={currency:'USD',unit:'MT',status:'negotiation',incoterm:'FOB',destination:'Named port'};
 const r=counterCoach(input!,deal);assert.ok('draft'in r);assert.match(r.notice,/not a market valuation/);assert.match(r.draft,/other terms still to be agreed/);
 assert.ok('error'in counterCoach(input!,{...deal,status:'completed'}));assert.ok('error'in counterCoach(input!,{...deal,currency:'EUR'}));assert.ok('error'in counterCoach(input!,{...deal,unit:null}));assert.equal(counterCoachCommand('he said coach counter 95 USD'),null);
});
