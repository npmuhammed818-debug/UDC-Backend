import {test} from 'node:test';import assert from 'node:assert/strict';
import {addPriceReferences,currencyPreferenceCommand} from '../src/marketData/priceCurrency.ts';
test('price references preserve exact terms and use explicit supported codes only',async()=>{
 const calls:any[]=[];const convert=async(i:any)=>{calls.push(i);return {converted:'84.12',rateDate:'2026-11-05'} as any;};
 const original='Quote: USD 1.00/MT, 2 OMR per carton. Buyer private note.';
 const out=await addPriceReferences(original,'INR',convert);assert.ok(out.startsWith(original+'\n'));assert.match(out,/Original currency, units and deal\/payment terms unchanged/);assert.deepEqual(calls,[{base:'USD',amount:'1.00',quote:'INR'},{base:'OMR',amount:'2',quote:'INR'}]);
 assert.equal(await addPriceReferences('$100, 100 MT, 100 XYZ','INR',convert),'$100, 100 MT, 100 XYZ');assert.equal(await addPriceReferences(out,'INR',convert),out);
 assert.equal(currencyPreferenceCommand('price currency inr'),'INR');assert.equal(currencyPreferenceCommand('he said price currency INR'),null);assert.equal(currencyPreferenceCommand('price currency off'),'OFF');
});
test('failed rates and too many prices never fabricate or silently replace original',async()=>{
 const original='USD 5';assert.match(await addPriceReferences(original,'INR',async()=>{throw Error('unavailable')}),/^USD 5\n.*No rate guessed/);
 let calls=0;const out=await addPriceReferences('USD 1 USD 2 USD 3 USD 4','INR',async()=>{calls++;throw Error();});assert.equal(calls,0);assert.match(out,/Too many prices/);
});
