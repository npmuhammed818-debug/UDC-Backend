import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explicitBuyerPriceFollowup } from '../src/akif/explicitIntakeFollowup.ts';

test('explicit buyer price and port followups preserve exactly supplied facts',()=>{
  assert.deepEqual(explicitBuyerPriceFollowup('USD 500 per MT, CIF Mombasa'),{targetPrice:500,currency:'USD',incoterm:'CIF',destination:'Mombasa'});
  assert.deepEqual(explicitBuyerPriceFollowup('$5,900.50/MT CIF Jebel Ali'),{targetPrice:5900.5,currency:'USD',incoterm:'CIF',destination:'Jebel Ali'});
  assert.deepEqual(explicitBuyerPriceFollowup('7900usd'),{targetPrice:7900,currency:'USD'});
  for(const text of ['USD 500?','What if USD 500 CIF Mombasa','USD 500 CIF Mombasa instead of Dubai','USD 500 is too high','USD 1,00 per MT','USD 1234,000 per MT','USD 0','EUR 500 per MT, CIF Mombasa','USD 500 CIF Mombasa please','Do not use USD 500'])assert.equal(explicitBuyerPriceFollowup(text),null,text);
});
