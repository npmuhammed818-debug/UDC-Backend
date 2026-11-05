import {currencyConversion,parseCurrencyAsk} from '../marketData/currency';import {sendWhatsAppText} from './client';
export async function handleCurrencyHelper(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;const input=parseCurrencyAsk(text);if(!input)return false;
 try{const result=await currencyConversion(input);await sendWhatsAppText(phone,`${result.amount} ${result.base} is about ${result.converted} ${result.quote}. Daily reference rate dated ${result.rateDate}, Frankfurter. ${result.notice}`);}catch{await sendWhatsAppText(phone,'A dated exchange rate is not available right now. No rate guessed. Your deal terms are unchanged.');}return true;
}
