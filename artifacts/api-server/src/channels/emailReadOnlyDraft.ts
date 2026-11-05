import {documentCheckText} from '../deals/documentCheckText';
import {documentCheckRead} from '../deals/documentCheckRead';
import {traderCompletionDiary} from '../deals/traderDiary';
import {traderDiaryText} from '../deals/traderDiaryText';
import {photoQuoteReview} from '../deals/photoQuoteReview';
import {photoQuoteText} from '../deals/photoQuoteText';
import {emailAccount} from './emailAccount';
import {qualityProofPack} from '../deals/qualityProofPack';
import {qualityProofText} from '../deals/qualityProofText';
import {dealReadSummary} from '../deals/dealReadSummary';
import {emailDealHistory} from './emailAccount';
import {emailHistoryDraft} from './emailHistoryDraft';
import {termExplanation,formatTermExplanation} from '../tradeEducation/terms';
/** Read-only deterministic capability adapter. No model/tool execution, sender
 * authority, agreement, mailbox access or real send is inferred from email text. */
export async function emailReadOnlyDraft(address:string,text:string){
 const input=text.trim();
 const term=termExplanation(input);if(term)return formatTermExplanation(term)+'\nStaging email draft only. No deal terms changed and no message sent.';
 const check=/^check document ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}) ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(input);
 if(check){const account=emailAccount(),principal=account&&await account.repository.resolve(address);if(!principal)return 'That document comparison is unavailable. No private record was returned.';
 const result=await documentCheckRead(principal.userId,check[1],check[2]),current=await account!.repository.resolve(address);
 if('error'in result||!current||current.userId!==principal.userId||current.role!==principal.role||current.consentVersion!==principal.consentVersion)return 'That document comparison is unavailable. A current approved record, access and extraction are required. No private record was returned.';
 return documentCheckText(result)+'\nStaging email draft only. No approval, terms change or message sent.';}
 const diary=/^my diary (\d{4}-(?:0[1-9]|1[0-2]))$/i.exec(input);
 if(diary){const account=emailAccount(),principal=account&&await account.repository.resolve(address);if(!principal)return 'Your private diary is unavailable for this account. No private record was returned.';
 const result=await traderCompletionDiary(principal.userId,diary[1]),current=await account!.repository.resolve(address);
 if('error'in result||!current||current.userId!==principal.userId||current.role!==principal.role||current.consentVersion!==principal.consentVersion)return 'Your private diary is unavailable for this account and UTC month. No private record was returned.';
 return traderDiaryText(result)+'\nStaging email draft only. No message sent.';}
 const photo=/^review photo quote ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}) ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(input);
 if(photo){const account=emailAccount(),principal=account&&await account.repository.resolve(address);if(!principal)return 'That photo extraction is unavailable for this account. No private record was returned.';
 const review=await photoQuoteReview(principal.userId,photo[1],photo[2]),current=await account!.repository.resolve(address);
 if('error'in review||!current||current.userId!==principal.userId||current.role!==principal.role||current.consentVersion!==principal.consentVersion)return 'That photo extraction is unavailable for this account. No private record was returned.';
 return photoQuoteText(review)+'\nStaging email draft only. Your review is not recorded by this email. No files opened or shared and no message sent.';}
 const m=/^(history|deal status|deal terms|quality proof pack) ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(input);
 if(!m)return 'Staging email draft only. Available read-only requests: check document DEAL-ID DOCUMENT-ID, my diary YYYY-MM, history DEAL-ID, deal status DEAL-ID, deal terms DEAL-ID, quality proof pack DEAL-ID, review photo quote DEAL-ID DOCUMENT-ID, or explain FOB/CIF/CFR/FAS/LC. Use an exact deal reference. This is not full AKIF email conversation support. No order, deal or payment action was taken.';
 if(m[1].toLowerCase()==='quality proof pack'){
 const account=emailAccount(),principal=account&&await account.repository.resolve(address);if(!principal)return 'That deal is unavailable for this account. No private record was returned.';
 const index=await qualityProofPack(principal.userId,m[2]);const current=await account!.repository.resolve(address);
 if('error'in index||!current||current.userId!==principal.userId||current.role!==principal.role||current.consentVersion!==principal.consentVersion)return 'That deal is unavailable for this account. No private record was returned.';
 return qualityProofText(index)+'\nStaging email draft only. No files opened or shared, no new access granted and no message sent.';
 }
 if(m[1].toLowerCase()==='deal terms'){
 const account=emailAccount(),principal=account&&await account.repository.resolve(address);if(!principal)return 'That deal is unavailable for this account. No private record was returned.';
 const summary=await dealReadSummary(principal.userId,m[2]);const current=await account!.repository.resolve(address);
 if(!summary||!current||current.userId!==principal.userId||current.role!==principal.role||current.consentVersion!==principal.consentVersion)return 'That deal is unavailable for this account. No private record was returned.';
 return summary.text+'\nStaging email draft only. No message sent.';
 }
 const history=await emailDealHistory(address,m[2]);if(!history)return 'That deal is unavailable for this account. No private record was returned.';
 if(m[1].toLowerCase()==='history')return emailHistoryDraft(history);
 return `Deal ${history.dealNumber.slice(0,80)}: recorded stage ${history.status.slice(0,80)}.\nStage only, not proof of payment, cargo location, delivery or acceptance. This read-only draft makes no change.\n${history.notice}`;
}
