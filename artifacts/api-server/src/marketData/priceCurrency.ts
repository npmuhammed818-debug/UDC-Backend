import {minorUnitDigits} from '../referrals/currencyPrecision.ts';
import {currencyConversion} from './currency.ts';
export function currencyPreferenceCommand(text:string){const m=/^price currency (off|[A-Za-z]{3})$/i.exec(text.trim());if(!m)return null;return m[1].toUpperCase();}
/** Original message and unit always remain intact. Never infer currency from a symbol,
 * location, phone prefix, product or language. No private text goes to the provider. */
export async function addPriceReferences(text:string,quote:string,convert:typeof currencyConversion=currencyConversion){
 if(minorUnitDigits(quote)===null||text.includes('[Indicative FX]'))return text;
 const values=[...text.matchAll(/(?<![\w.,-])([A-Z]{3})\s+(\d{1,15}(?:\.\d{1,6})?)(?![\d.,])|(?<![\w.,-])(\d{1,15}(?:\.\d{1,6})?)\s+([A-Z]{3})\b/g)].map(m=>({base:m[1]||m[4],amount:m[2]||m[3]})).filter(v=>minorUnitDigits(v.base)!==null&&v.base!==quote);
 const unique=[...new Map(values.map(v=>[v.base+':'+v.amount,v])).values()];if(!unique.length)return text;
 if(unique.length>3)return text+'\n[Indicative FX] Too many prices for an automatic reference. Ask convert AMOUNT CODE to CODE for each price. Original terms unchanged.';
 const lines=[];for(const v of unique){try{const r=await convert({...v,quote});lines.push(`${v.amount} ${v.base} ~ ${r.converted} ${quote}; rate dated ${r.rateDate}.`);}catch{lines.push(`${v.amount} ${v.base}: dated ${quote} reference unavailable. No rate guessed.`);}}
 return text+'\n[Indicative FX] '+lines.join(' ')+' Frankfurter daily reference, fees/spreads excluded. Original currency, units and deal/payment terms unchanged.';
}
