import {emailDealHistory} from './emailAccount';
import {emailHistoryDraft} from './emailHistoryDraft';
import {termExplanation,formatTermExplanation} from '../tradeEducation/terms';
/** Read-only deterministic capability adapter. No model/tool execution, sender
 * authority, agreement, mailbox access or real send is inferred from email text. */
export async function emailReadOnlyDraft(address:string,text:string){
 const input=text.trim();
 const term=termExplanation(input);if(term)return formatTermExplanation(term)+'\nStaging email draft only. No deal terms changed and no message sent.';
 const m=/^(history|deal status) ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(input);
 if(!m)return 'Staging email draft only. Available read-only requests: history DEAL-ID, deal status DEAL-ID, or explain FOB/CIF/CFR/FAS/LC. Use an exact deal reference. This is not full AKIF email conversation support. No order, deal or payment action was taken.';
 const history=await emailDealHistory(address,m[2]);if(!history)return 'That deal is unavailable for this account. No private record was returned.';
 if(m[1].toLowerCase()==='history')return emailHistoryDraft(history);
 return `Deal ${history.dealNumber.slice(0,80)}: recorded stage ${history.status.slice(0,80)}.\nStage only, not proof of payment, cargo location, delivery or acceptance. This read-only draft makes no change.\n${history.notice}`;
}
