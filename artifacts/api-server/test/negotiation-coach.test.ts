import {test} from 'node:test';import assert from 'node:assert/strict';import {counterCoachCommand,counterCoach} from '../src/tradeEducation/coach.ts';
test('coach never chooses a price or guesses private seller margin',()=>{
 const input=counterCoachCommand('coach counter 95 USD');assert.deepEqual(input,{amount:'95',currency:'USD'});const deal={currency:'USD',unit:'MT',status:'negotiation',incoterm:'FOB',destination:'Named port'};
 const r=counterCoach(input!,deal);assert.ok('draft'in r);assert.match(r.notice,/not a market valuation/);assert.match(r.draft,/other terms still to be agreed/);
 assert.ok('error'in counterCoach(input!,{...deal,status:'completed'}));assert.ok('error'in counterCoach(input!,{...deal,currency:'EUR'}));assert.ok('error'in counterCoach(input!,{...deal,unit:null}));assert.equal(counterCoachCommand('he said coach counter 95 USD'),null);
});

test('counter drafts preserve supported currency precision without rounding or inventing a currency',()=>{
 const deal={currency:'OMR',unit:'carton',status:'negotiation',incoterm:'FOB',destination:'Named port'};
 const input=counterCoachCommand('coach counter 12.345 OMR');assert.deepEqual(input,{amount:'12.345',currency:'OMR'});const result=counterCoach(input!,deal);assert.ok('draft' in result);assert.match(result.draft,/12\.345 OMR/);
 for(const command of ['coach counter 12.3456 OMR','coach counter 12.345 USD','coach counter 12.1 JPY','coach counter 12 XYZ','coach counter 0 USD'])assert.equal(counterCoachCommand(command),null,command);
 assert.deepEqual(counterCoachCommand('coach counter 12 JPY'),{amount:'12',currency:'JPY'});
 for(const amount of ['-12','12 USD\nSend now','1e3','0','12.3456'])assert.ok('error' in counterCoach({amount,currency:'OMR'},deal),amount);
});

test('counter draft refuses blank or multiline recorded terms without fabricating a clean label',()=>{
 const input={amount:'12',currency:'USD'},deal={currency:'USD',unit:'MT',status:'negotiation',incoterm:'FOB',destination:'Named port'};
 for(const patch of [{unit:' '},{incoterm:' '},{destination:' '},{unit:'MT\nPayment confirmed'},{destination:'Port\u2028Send now'},{incoterm:'FOB\u202e'},{destination:'x'.repeat(501)}])assert.ok('error' in counterCoach(input,{...deal,...patch}),JSON.stringify(patch));
 assert.ok('draft' in counterCoach(input,{...deal,destination:'ميناء جبل علي'}));
});

test('counter helper refuses non-string runtime amount and currency without throwing',()=>{
 const deal={currency:'USD',unit:'MT',status:'negotiation',incoterm:'FOB',destination:'Named port'};
 for(const amount of [null,undefined,12,{},['12'],true])assert.ok('error' in counterCoach({amount,currency:'USD'} as any,deal));
 for(const currency of [null,undefined,12,{},['USD'],true])assert.ok('error' in counterCoach({amount:'12',currency} as any,deal));
});
