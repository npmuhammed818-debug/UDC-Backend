import {test} from 'node:test';import assert from 'node:assert/strict';import {documentCheck} from '../src/deals/documentCheck.ts';
const deal={quantity:'100.000000',unit:'MT',agreedPrice:'9999999999999999.01',currency:'USD',incoterm:'FOB',destination:'Dubai'};
test('document flags compare exact decimals without float rounding or approvals',()=>{
 const r=documentCheck(deal,{quantity:{value:'100',unit:'MT'},pricing:{unitPrice:'9999999999999999.02',currency:'USD',basis:'MT'},logistics:{incoterm:'CIF',destination:'Dubai'}});
 assert.equal(r.checks.find(c=>c.field==='quantity')!.state,'match');assert.equal(r.checks.find(c=>c.field==='unit_price')!.state,'mismatch');assert.equal(r.checks.find(c=>c.field==='incoterm')!.state,'mismatch');assert.equal(r.authenticityVerified,false);assert.equal(r.needsHumanReview,true);
});
test('missing fields and changed price bases/currencies are never silently converted',()=>{
 for(const p of [{currency:'EUR',basis:'MT',unitPrice:'9999999999999999.01'},{currency:'USD',basis:'kg',unitPrice:'1'}])assert.equal(documentCheck(deal,{pricing:p}).checks.find(c=>c.field==='unit_price')!.state,'not_comparable');
 assert.ok(documentCheck(deal,null).checks.every(c=>c.state==='not_comparable'));
 assert.equal(documentCheck(deal,{quantity:{value:'100e0',unit:'MT'}}).checks.find(c=>c.field==='quantity')!.state,'not_comparable');
});

test('unsafe JSON numeric extraction cannot become an exact decimal match',()=>{
 const r=documentCheck({...deal,agreedPrice:'9007199254740992'},{pricing:{unitPrice:9007199254740992,currency:'USD',basis:'MT'}});assert.equal(r.checks.find(c=>c.field==='unit_price')!.state,'not_comparable');
 const exact=documentCheck({...deal,agreedPrice:'9007199254740992'},{pricing:{unitPrice:'9007199254740992',currency:'USD',basis:'MT'}});assert.equal(exact.checks.find(c=>c.field==='unit_price')!.state,'match');
});

test('bounded display cannot hide an extracted destination suffix in exact comparison',()=>{const destination='A'.repeat(120);const c=documentCheck({...deal,destination},{logistics:{destination:destination+' DIFFERENT PORT'}}).checks.find(c=>c.field==='destination')!;assert.equal(c.state,'mismatch');assert.ok(c.extracted!.length<=120);assert.equal(documentCheck({...deal,destination},{logistics:{destination}}).checks.find(c=>c.field==='destination')!.state,'match');});
