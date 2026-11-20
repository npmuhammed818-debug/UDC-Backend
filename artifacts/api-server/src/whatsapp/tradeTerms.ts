import {termExplanation,formatTermExplanation} from '../tradeEducation/terms';
import {sendWhatsAppText} from './client';
export async function handleTradeTerm(phone:string,text:string){if(process.env.UDC_APP_ENV!=='staging')return false;const answer=termExplanation(text);if(!answer)return false;await sendWhatsAppText(phone,formatTermExplanation(answer));return true;}
