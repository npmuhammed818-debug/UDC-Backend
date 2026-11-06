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

test('automatic price references refuse partial, signed and embedded Unicode tokens',async()=>{
 let calls=0;const convert=async()=>{calls++;return {converted:'84',rateDate:'2026-11-05'} as any;};
 for(const text of ['USD 1e6','USD 12abc','USD 12\u0663','\u03b1USD 12','12 USD\u03b1','\u221212 USD','+12 USD','\u066312 USD','USD 12\u0301'])assert.equal(await addPriceReferences(text,'INR',convert),text,text);
 assert.equal(calls,0);assert.match(await addPriceReferences('USD 12/MT','INR',convert),/Indicative FX/);assert.equal(calls,1);
});

test('automatic FX never converts one endpoint of an amount range',async()=>{
 let calls=0;const convert=async()=>{calls++;return {converted:'84',rateDate:'2026-11-05'} as any;};
 for(const text of ['USD 12-15','USD 12\u201315','USD 12\u201415','USD 12\u221215','12\u201315 USD','12\u201415 USD','USD 12 - 15','12 - 15 USD'])assert.equal(await addPriceReferences(text,'INR',convert),text,text);assert.equal(calls,0);
 assert.match(await addPriceReferences('USD 12 - price per MT','INR',convert),/Indicative FX/);
});

test('automatic FX refuses signed and accounting-negative prices even with spaces',async()=>{
 let calls=0;const convert=async()=>{calls++;return {converted:'84',rateDate:'2026-11-05'} as any;};
 for(const text of ['- 12 USD','+ 12 USD','\u2212 12 USD','- USD 12','+ USD 12','\u2212 USD 12','(12 USD)','(USD 12)'])assert.equal(await addPriceReferences(text,'INR',convert),text,text);assert.equal(calls,0);
 assert.match(await addPriceReferences('Quote: USD 12 per MT','INR',convert),/Indicative FX/);
});

test('automatic FX refuses percentage and ratio-like values rather than guessing a price',async()=>{
 let calls=0;const convert=async()=>{calls++;return {converted:'84',rateDate:'2026-11-05'} as any;};
 for(const text of ['USD 12%','USD 12 %','USD 12\u066a','USD 12\u2030','USD 12/15','USD 12 / 15'])assert.equal(await addPriceReferences(text,'INR',convert),text,text);assert.equal(calls,0);
 assert.match(await addPriceReferences('USD 12/carton','INR',convert),/Indicative FX/);
});

test('automatic FX refuses scaled amounts and textual ranges or denominator fragments',async()=>{
 let calls=0;const convert=async()=>{calls++;return {converted:'84',rateDate:'2026-11-05'} as any;};
 for(const text of ['USD 12 million','USD 12 billion','USD 12 thousand','USD 12 lakh','USD 12 crore','12 million USD','USD 12 to 15','12 to 15 USD','USD 12 through 15','1/12 USD','1 / 12 USD'])assert.equal(await addPriceReferences(text,'INR',convert),text,text);assert.equal(calls,0);
 assert.match(await addPriceReferences('USD 12 per carton','INR',convert),/Indicative FX/);
});
