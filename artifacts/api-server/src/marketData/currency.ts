import {minorUnitDigits} from '../referrals/currencyPrecision.ts';
/** Indicative conversion only, never edits deal terms or executes FX. Source
 * documentation: https://frankfurter.dev/ (commercial blended rates free).
 * Provider receives the public currency pair only, never amount/account/deal. */
export function parseCurrencyAsk(text:string){const m=/^convert (\d{1,15}(?:\.\d{1,6})?) ([A-Za-z]{3}) to ([A-Za-z]{3})[.!?]?$/.exec(text.trim());return m?{amount:m[1],base:m[2].toUpperCase(),quote:m[3].toUpperCase()}:null;}
export function indicativeAmount(amount:string,rate:string,places:number){
 if(typeof amount!=='string'||typeof rate!=='string'||!Number.isInteger(places)||!/^\d{1,15}(?:\.\d{1,6})?$/.test(amount)||!/^\d{1,10}(?:\.\d{1,12})?$/.test(rate)||places<0||places>4)throw Error('invalid_conversion');
 const [a,af='']=amount.split('.'),[r,rf='']=rate.split('.');const product=BigInt(a+af)*BigInt(r+rf),denominator=10n**BigInt(af.length+rf.length),scale=10n**BigInt(places);const rounded=(product*scale+denominator/2n)/denominator;return places?String(rounded/scale)+'.'+String(rounded%scale).padStart(places,'0'):String(rounded);
}
type Quote={date:string;base:string;quote:string;rate:number};
const cache=new Map<string,{at:number;data:Quote}>();
export function clearCurrencyCache(){cache.clear();}
export async function currencyConversion(input:{amount:string;base:string;quote:string},ports:{fetch?:typeof fetch;now?:number}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.amount!=='string'||typeof input.base!=='string'||typeof input.quote!=='string')throw Error('invalid_conversion');
 const amount=input.amount,base=input.base.toUpperCase(),quote=input.quote.toUpperCase();if(!/^[A-Z]{3}$/.test(base)||!/^[A-Z]{3}$/.test(quote)||!/^\d{1,15}(?:\.\d{1,6})?$/.test(amount))throw Error('invalid_conversion');
 const places=minorUnitDigits(quote);if(places===null||minorUnitDigits(base)===null)throw Error('unsupported_currency');
 const now=ports.now??Date.now(),today=new Date(now).toISOString().slice(0,10),sourceUrl='https://api.frankfurter.dev/v2/rate/'+base.toLowerCase()+'/'+quote.toLowerCase();
 let data:Quote;
 if(base===quote)data={date:today,base,quote,rate:1};else{
  const key=base+quote,prior=cache.get(key);
  if(prior&&now-prior.at<6*3600000&&now>=prior.at)data=prior.data;else{
   const response=await (ports.fetch??fetch)(sourceUrl,{signal:AbortSignal.timeout(7000),redirect:'error'});if(!response.ok)throw Error('currency_rate_unavailable');
   const length=Number(response.headers.get('content-length')||0);if(length>4096){await response.body?.cancel();throw Error('invalid_rate_response');}const reader=response.body?.getReader();if(!reader)throw Error('invalid_rate_response');const chunks:Uint8Array[]=[];let size=0;try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>4096){await reader.cancel();throw Error('invalid_rate_response');}chunks.push(next.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}data=JSON.parse(new TextDecoder().decode(bytes));
   if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.date!=='string'||data.base!==base||data.quote!==quote||!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!Number.isFinite(data.rate)||data.rate<=0||data.rate>1e10||!/^\d{1,10}(?:\.\d{1,12})?$/.test(String(data.rate)))throw Error('invalid_rate_response');
   const day=Date.parse(data.date+'T00:00:00Z');if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==data.date)throw Error('invalid_rate_response');
   if(now-day<0||now-day>7*86400000)throw Error('currency_rate_stale');
   if(cache.size>=500)cache.delete(cache.keys().next().value!);cache.set(key,{at:now,data});
  }
 }
 const age=now-Date.parse(data.date+'T00:00:00Z');if(!Number.isFinite(age)||age<0||age>7*86400000)throw Error('currency_rate_stale');
 return {amount,base,quote,rate:String(data.rate),converted:indicativeAmount(amount,String(data.rate),places),rounding:`Half up to ${places} decimal places`,rateDate:data.date,sourceUrl,indicativeOnly:true,notice:'Daily reference estimate, not a bank quote. Fees and spreads excluded. Deal terms and payments are unchanged.'};
}
