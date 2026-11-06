import {minorUnitDigits} from '../referrals/currencyPrecision.ts';
function validCounter(amount:string,currency:string){const places=minorUnitDigits(currency);return places!==null&&/^\d{1,15}(?:\.\d{1,3})?$/.test(amount)&&/[1-9]/.test(amount)&&(amount.split('.')[1]?.length??0)<=places;}
export function counterCoachCommand(text:string){const m=/^coach counter (\d{1,15}(?:\.\d{1,3})?) ([A-Za-z]{3})[.!?]?$/i.exec(text.trim());return m&&validCounter(m[1],m[2].toUpperCase())?{amount:m[1],currency:m[2].toUpperCase()}:null;}
export function counterCoach(input:{amount:string;currency:string},deal:{currency:string|null;unit:string|null;status:string;incoterm:string|null;destination:string|null}):{error:string}|{draft:string;notice:string}{
 if(deal.status!=='negotiation')return {error:'This deal is not in negotiation. No draft or terms change made.'};
 if(!validCounter(input.amount,input.currency)||input.currency!==deal.currency||!deal.unit||!deal.incoterm||!deal.destination)return {error:'An exact current currency, unit, Incoterm and destination are needed. No conversion or missing term guessed.'};
 return {draft:`Would you consider ${input.amount} ${input.currency} per ${deal.unit}, ${deal.incoterm} ${deal.destination}, with the other terms still to be agreed? Please confirm quantity, grade, inspection, shipment date and payment terms.`,notice:'Private draft only, not sent. This number is your proposed counter, not a market valuation. Seller cost, margin and willingness are unknown. No terms, order, commission or payment changed.'};
}
