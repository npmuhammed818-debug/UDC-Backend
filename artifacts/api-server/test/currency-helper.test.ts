import {test} from 'node:test';import assert from 'node:assert/strict';import {parseCurrencyAsk,indicativeAmount,currencyConversion,clearCurrencyCache} from '../src/marketData/currency.ts';
test('currency conversion uses exact decimal half-up and only explicit requests',()=>{
 assert.equal(indicativeAmount('100.05','1.12345',2),'112.40');assert.equal(indicativeAmount('1','1.005',2),'1.01');assert.equal(indicativeAmount('999999999999999','1',2),'999999999999999.00');assert.equal(indicativeAmount('1','1.5',0),'2');assert.equal(indicativeAmount('1','1.0005',3),'1.001');
 assert.deepEqual(parseCurrencyAsk('convert 100 USD to INR'),{amount:'100',base:'USD',quote:'INR'});for(const s of ['he said convert 100 USD to INR','convert my deal to INR','convert -5 USD to EUR'])assert.equal(parseCurrencyAsk(s),null);
});
test('provider gets currency pair only, caches pair, preserves date and rejects stale/invalid',async()=>{
 clearCurrencyCache();let calls=0;const fetcher=async(url:any)=>{calls++;assert.equal(String(url),'https://api.frankfurter.dev/v2/rate/usd/inr');return new Response(JSON.stringify({date:'2026-11-04',base:'USD',quote:'INR',rate:84.12}));};
 const a=await currencyConversion({amount:'100',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now:Date.parse('2026-11-05T00:00Z')});assert.equal(a.converted,'8412.00');assert.equal(a.rateDate,'2026-11-04');assert.equal(a.indicativeOnly,true);
 await currencyConversion({amount:'500',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now:Date.parse('2026-11-05T01:00Z')});assert.equal(calls,1);
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now:Date.parse('2026-11-15T00:00Z')}),/stale/);
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(JSON.stringify({date:'2026-11-04',base:'EUR',quote:'INR',rate:1}))}),/invalid/);
});

test('currency rates reject impossible calendar dates rather than normalizing them',async()=>{
 for(const date of ['2026-02-30','2026-02-29','2026-04-31','2026-13-01','2026-00-10']){
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(JSON.stringify({date,base:'USD',quote:'INR',rate:84})),now:Date.parse(date==='2026-04-31'?'2026-05-02T00:00:00Z':'2026-03-03T00:00:00Z')}),/invalid_rate_response/);
 }
 clearCurrencyCache();const result=await currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(JSON.stringify({date:'2028-02-29',base:'USD',quote:'INR',rate:84})),now:Date.parse('2028-03-01T00:00:00Z')});assert.equal(result.rateDate,'2028-02-29');
});

test('currency references never present a future UTC rate date as current',async()=>{
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(JSON.stringify({date:'2026-11-06',base:'USD',quote:'INR',rate:84})),now:Date.parse('2026-11-05T23:59:59Z')}),/currency_rate_stale/);
 clearCurrencyCache();const result=await currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(JSON.stringify({date:'2026-11-05',base:'USD',quote:'INR',rate:84})),now:Date.parse('2026-11-05T00:00:00Z')});assert.equal(result.rateDate,'2026-11-05');
});

test('rejected stale and future rates never poison the pair cache',async()=>{
 for(const badDate of ['2026-10-01','2026-11-06']){
 clearCurrencyCache();let calls=0;const fetcher=async()=>new Response(JSON.stringify({date:++calls===1?badDate:'2026-11-05',base:'USD',quote:'INR',rate:84}));const ports={fetch:fetcher as typeof fetch,now:Date.parse('2026-11-05T12:00:00Z')};
 await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},ports),/currency_rate_stale/);const result=await currencyConversion({amount:'2',base:'USD',quote:'INR'},ports);assert.equal(result.converted,'168.00');assert.equal(calls,2);
 }
});

test('unrepresentable provider rates fail before cache and allow a valid retry',async()=>{
 for(const badRate of [1e-7,1e10,0.1234567890123]){
 clearCurrencyCache();let calls=0;const fetcher=async()=>new Response(JSON.stringify({date:'2026-11-05',base:'USD',quote:'INR',rate:++calls===1?badRate:84}));const ports={fetch:fetcher as typeof fetch,now:Date.parse('2026-11-05T12:00:00Z')};
 await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},ports),/invalid_rate_response/);assert.equal((await currencyConversion({amount:'2',base:'USD',quote:'INR'},ports)).converted,'168.00');assert.equal(calls,2);
 }
});

test('currency runtime inputs and provider envelopes fail with controlled errors',async()=>{
 let calls=0;const ports={fetch:async()=>{calls++;return new Response('{}');},now:Date.parse('2026-11-05T12:00:00Z')};
 for(const input of [null,{},[],{amount:1,base:'USD',quote:'INR'},{amount:'1',base:42,quote:'INR'},{amount:'1',base:'USD',quote:null}])await assert.rejects(currencyConversion(input as never,ports),/invalid_conversion/);assert.equal(calls,0);
 for(const value of [null,[],42,{date:20261105,base:'USD',quote:'INR',rate:84},{date:'2026-11-05',base:'USD',quote:'INR',rate:'84'}]){clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{...ports,fetch:async()=>new Response(JSON.stringify(value))}),/invalid_rate_response/);}
 for(const places of [NaN,Infinity,1.5,'2',null])assert.throws(()=>indicativeAmount('1','1',places as never),/invalid_conversion/);
});

test('currency provider isolation enforces byte bound and redirect refusal without leaking private inputs',async()=>{
 const now=Date.parse('2026-11-05T12:00:00Z');let observed:any;
 const fetcher=async(url:any,options:any)=>{observed={url:String(url),options};return new Response(JSON.stringify({date:'2026-11-05',base:'USD',quote:'INR',rate:84}));};clearCurrencyCache();
 await currencyConversion({amount:'987654321.123456',base:'USD',quote:'INR'},{fetch:fetcher as typeof fetch,now});assert.equal(observed.url,'https://api.frankfurter.dev/v2/rate/usd/inr');assert.equal(observed.options.redirect,'error');assert.equal(observed.options.body,undefined);assert.equal(observed.options.headers,undefined);assert.ok(observed.options.signal instanceof AbortSignal);assert.ok(!JSON.stringify(observed).includes('987654321'));
 for(const advertised of [true,false]){clearCurrencyCache();let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(' '.repeat(4097)));},cancel(){cancelled=true;}});const response=new Response(stream,advertised?{headers:{'content-length':'4097'}}:undefined);await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>response,now}),/invalid_rate_response/);assert.equal(cancelled,true,'oversized stream is cancelled whether size was advertised or streamed');}
 clearCurrencyCache();await assert.rejects(currencyConversion({amount:'1',base:'USD',quote:'INR'},{fetch:async()=>new Response(null,{status:302,headers:{location:'https://other.example.invalid'}}),now}),/currency_rate_unavailable/);
});
