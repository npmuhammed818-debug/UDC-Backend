import {test} from 'node:test';import assert from 'node:assert/strict';import {parseCurrencyAsk,indicativeAmount,currencyConversion,clearCurrencyCache} from '../src/marketData/currency.ts';
test('currency conversion uses exact decimal half-up and only explicit requests',()=>{
 assert.equal(indicativeAmount('100.05','1.12345',2),'112.40');assert.equal(indicativeAmount('1','1.005',2),'1.01');assert.equal(indicativeAmount('999999999999999','1',2),'999999999999999.00');assert.equal(indicativeAmount('1','1.5',0),'2');
 assert.deepEqual(parseCurrencyAsk('convert 100 USD to INR'),{amount:'100',base:'USD',quote:'INR'});for(const s of ['he said convert 100 USD to INR','convert my deal to INR','convert -5 USD to EUR'])assert.equal(parseCurrencyAsk(s),null);
});
test('provider gets currency pair only, caches pair, preserves date and rejects stale/invalid',async()=>{
 clearCurrencyCache();let calls=0;const fetcher=async(url:any)=>{calls++;assert.equal(String(url),'https://api.frankfurter.dev/v2/rate/usd/inr');return new Response(JSON.stringify({date:'2026-11-04',base:'USD',quote:'INR',rate:84.12}));};
 const a=await currencyConversion({amount:'100',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now:Date.parse('2026-11-05T00:00Z')});assert.equal(a.converted,'8412.00');assert.equal(a.rateDate,'2026-11-04');assert.equal(a.indicativeOnly,true);
 await currencyConversion({amount:'500',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now:Date.parse('2026-11-05T01:00Z')});assert.equal(calls,1);
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now:Date.parse('2026-11-15T00:00Z')}),/stale/);
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(JSON.stringify({date:'2026-11-04',base:'EUR',quote:'INR',rate:1}))}),/invalid/);
});
