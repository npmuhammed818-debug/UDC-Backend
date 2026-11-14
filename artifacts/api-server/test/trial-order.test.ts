import {test} from 'node:test';import assert from 'node:assert/strict';import {reducedQuantity,trialOrderCommand,canonicalTrialQuantity} from '../src/deals/trialOrderText.ts';
test('trial quantities require positive reduction with exact decimals and explicit command',()=>{assert.equal(reducedQuantity('0.000001','1'),true);for(const q of ['0','-1','1','1.000001','NaN'])assert.equal(reducedQuantity(q,'1'),false);assert.deepEqual(trialOrderCommand('trial order 2 MT'),{quantity:'2',unit:'MT'});assert.equal(trialOrderCommand('maybe trial order 2 MT'),null);});

test('trial quantities canonicalize equal exact decimals without floats',()=>{assert.equal(canonicalTrialQuantity('02.000000'),'2');assert.equal(canonicalTrialQuantity('0000.200100'),'0.2001');assert.equal(canonicalTrialQuantity('99999999999999999999.000001'),'99999999999999999999.000001');assert.equal(canonicalTrialQuantity('2e0'),null);});

test('trial quantity helpers reject non-string runtime values without coercion or a crash',()=>{
 for(const value of [null,undefined,2,{},['2'],true]){
  assert.equal(canonicalTrialQuantity(value as any),null);
  assert.equal(reducedQuantity(value as any,'10'),false);
  assert.equal(reducedQuantity('1',value as any),false);
 }
});
