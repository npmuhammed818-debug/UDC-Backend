import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('Akif guidance remembers language and follow-ups without verification or trade writes; voice actions stay unconfirmed', async()=>{
 const state:any={rows:new Map(), calls:[], reply:'അതെ, മലയാളത്തിൽ സംസാരിക്കാം.', modelFailure:false};
 const query:any={from:(table:any)=>{query.table=table;return query;},where:(x:any)=>{query.key=x.b;return query;},limit:async()=>query.table?.phone==='phone'?(state.account?[state.account]:[]):state.rows.has(query.key)?[state.rows.get(query.key)]:[]};
 state.db={select:()=>query,insert:()=>({values:(v:any)=>({onConflictDoUpdate:async()=>{assert.ok(['profile_buyer','profile_seller','profile_agent','buyer','seller'].includes(v.purpose),'must respect the deployed SQL CHECK constraint');if(state.saveFailure)throw Error('PRIVATE_DATABASE_FAILURE');state.rows.set(v.phoneHash,v);}})})};
 (globalThis as any).__guidance=state;
 const path=fileURLToPath(new URL('./guidance-'+randomUUID()+'.mjs',import.meta.url));
 const result=await build({stdin:{contents:"export * from '../src/whatsapp/guidance';export * from '../src/akif/udcHandbook';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'guidance-fixtures',setup(b){
 b.onResolve({filter:/^@workspace\/db$|^drizzle-orm$|hermesClient$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='@workspace/db'?"export const db=globalThis.__guidance.db;export const whatsappChatSessionsTable={phoneHash:'hash'};export const usersTable={role:'role',status:'status',phone:'phone'};":a.path==='drizzle-orm'?"export const eq=(a,b)=>({a,b});":"export const runConversationChat=async(message,system)=>{const s=globalThis.__guidance;s.calls.push({message,system});if(s.modelFailure)throw Error('MODEL_UNAVAILABLE');return {content:s.reply};};"}));
 }}]});await writeFile(path,result.outputFiles[0].text);
 const secret=process.env.WHATSAPP_APP_SECRET;process.env.WHATSAPP_APP_SECRET='test-guidance-secret-123';
 try{
 const {answerGuidance,isGuidanceQuestion,guidanceKey,validateGuidanceReply,trustedGuidanceAnswer}=await import(path);
 for(const text of ['What is dlc','Which payment method is safe for me?','Even for ur to answer and question?','Can you speak in malayalam?','എന്ത് ആണ് DLC?'])assert.equal(isGuidanceQuestion(text),true,text);
 assert.equal(isGuidanceQuestion('What is CIF?'),true);
 assert.equal(isGuidanceQuestion('CIF'),false,'a bare Incoterm may answer an active intake prompt');
 assert.match(trustedGuidanceAnswer('What is CIF?')??'',/Cost, Insurance and Freight/);
 assert.match(trustedGuidanceAnswer('What is CIF?')??'',/risk transfers to the buyer when the goods are loaded on board/);
 assert.equal(isGuidanceQuestion('Deal UDC-123: accept offer?'),false);
 assert.equal(isGuidanceQuestion('Need summery'),true);
 assert.equal(isGuidanceQuestion('too long'),true);
 assert.equal(isGuidanceQuestion('explain more'),true);
 assert.equal(isGuidanceQuestion('100 MT copper at 5900'),false);
 await answerGuidance('phone-one','Can you speak in malayalam?','1');
 assert.equal(state.rows.get(guidanceKey('phone-one')).data.mainLanguage,'malayalam');
 // Text is always English: a saved fact answer goes directly, with no model call.
 const beforeDlc=state.calls.length;
 assert.match(await answerGuidance('phone-one','What is dlc','2'),/Documentary Letter of Credit/);
 assert.equal(state.calls.length,beforeDlc);
 const count=state.calls.length;assert.equal(await answerGuidance('phone-one','What is dlc','2'),'');assert.equal(state.calls.length,count);
 await answerGuidance('phone-two','Explain export insurance?','3');assert.deepEqual(JSON.parse(state.calls.at(-1).message).history,[]);
 state.reply='You can ask learning questions before verification.';await answerGuidance('phone-one','Even to answer a question?','4');assert.match(JSON.parse(state.calls.at(-1).message).history.at(-1).content,/Documentary Letter of Credit/);
 state.reply='അതെ';await answerGuidance('phone-one','മലയാളത്തിൽ സംസാരിക്കാമോ?','5',true);assert.equal(JSON.parse(state.calls.at(-1).message).source,'voice_transcript');
 const before=state.rows.get(guidanceKey('phone-one'));state.reply='TRADE_ACTION';assert.equal(await answerGuidance('phone-one','Accept the seller offer','6',true),null);assert.equal(state.rows.get(guidanceKey('phone-one')),before);
 const oldHistory=state.rows.get(guidanceKey('phone-two'));oldHistory.data.handbookVersion='old';oldHistory.data.history=JSON.stringify([{role:'assistant',content:'UDC means Uniform Document Code'}]);
 state.reply='More about insurance.';
 await answerGuidance('phone-two','Tell me more about export insurance','history-reset');assert.deepEqual(JSON.parse(state.calls.at(-1).message).history,[]);
 // The comfortable-language question is asked once, early, and then saved.
 assert.match(state.calls.at(-1).system,/which language they are most comfortable in/);
 assert.equal(state.rows.get(guidanceKey('phone-two')).data.languageAsked,'1');
 for(const unsafe of ['UDC means Uniform Document Code.','Upload a passport and bank statement.','DLC is guaranteed safe.','Our website is https://fake.example/','long '.repeat(120)])assert.equal(validateGuidanceReply(unsafe),false,unsafe);
 assert.equal(trustedGuidanceAnswer('Who founded Apple?'),null);
 for(const q of ['How much commission do agents get?','When is my commission paid?','what is the referral fee?'])assert.match(trustedGuidanceAnswer(q,'agent')??'',/agent agreement.*UDC will confirm/,q);
 for(const bad of ['Referral commissions are usually a percentage of the deal value.','Your commission is paid after the deal closes.','Agents earn 2% commission.'])assert.equal(validateGuidanceReply(bad),false,bad);
 assert.equal(validateGuidanceReply('Commission terms are set in your agent agreement, and UDC will confirm them to you.'),true);
 assert.equal(trustedGuidanceAnswer('Deal UDC-123: accept offer'),null);
 state.reply='UDC means Uniform Document Code.';
 const facts=await answerGuidance('phone-public','What is UDC?','public-1');assert.match(facts,/UpDownCircle/);assert.doesNotMatch(facts,/Uniform/);
 assert.match(await answerGuidance('phone-public','Who is the founder?','public-2'),/Muhammed NP/);
 assert.match(await answerGuidance('phone-public','Give me our company website','public-3'),/https:\/\/updowncircle.site\//);
 assert.match(await answerGuidance('phone-public','Full form of akif','public-4'),/Advanced Knowledge and Intelligent Framework/);
 const docsAny=await answerGuidance('phone-public','What documents do I need for verification?','public-5');
 assert.match(docsAny,/company registration or trade licence/);
 assert.match(docsAny,/import licence/);
 assert.match(docsAny,/Bank proof from both sides is only needed later, before signing the SPA/);
 assert.match(docsAny,/Never send documents in this chat/);
 assert.match(await answerGuidance('phone-public','What is DLC?','public-6'),/Banks examine documents, not the actual goods/);
 const redirected=await answerGuidance('phone-public','Can you code a website?','public-7');assert.match(redirected,/trade assistant/);
 const guarded=await answerGuidance('phone-public','Explain export insurance?','public-8');assert.doesNotMatch(guarded,/Uniform/);
 state.account={role:'agent',status:'pending'};assert.match(await answerGuidance('phone-public','What documents do I need for verification?','public-9'),/personal or business email/);state.account=null;
 state.reply='The safest choice is guaranteed safe.';assert.doesNotMatch(await answerGuidance('phone-public','Explain export insurance?','public-10'),/guaranteed safe/);
 // Customer profile: the notebook refreshed before the 10th reply and the reply carried the profile.
 assert.match(state.calls.at(-2).system,/private notebook/);
 const profileSent=JSON.parse(state.calls.at(-1).message).customerProfile;
 assert.equal(profileSent.messages,10);
 assert.ok('mainLanguage' in profileSent && 'note' in profileSent && 'voiceNotes' in profileSent);
 assert.ok(JSON.parse(state.rows.get(guidanceKey('phone-public')).data.stats).messages>=10);
 state.reply='The answer remains available.';state.saveFailure=true;assert.equal(await answerGuidance('phone-three','Explain export insurance?','7',true),state.reply);assert.equal(state.rows.size,3);assert.ok(![...state.rows.keys()].some(k=>k.includes('phone')));
 state.saveFailure=false;state.modelFailure=false;state.reply='I can speak Malayalam.';
 await answerGuidance('phone-offline','Can you speak in Malayalam?','offline-language');
 assert.equal(state.rows.get(guidanceKey('phone-offline')).data.mainLanguage,'malayalam');
 state.modelFailure=true;
 const beforeOfflineDlc=state.calls.length;
 const offlineDlc=await answerGuidance('phone-offline','What is DLC?','offline-dlc');
 assert.match(offlineDlc,/bank’s undertaking to pay/);
 assert.equal(state.calls.length,beforeOfflineDlc,'saved fact answers never touch the model');
 const offlineGeneral=await answerGuidance('phone-offline','Explain export insurance?','offline-general');
 assert.match(offlineGeneral,/detailed trade-answer service is busy right now/);
 assert.doesNotMatch(offlineGeneral,/couldn’t prepare that answer just now/);
 // Brevity: "summary" uses history, sets the brief preference and never hits the scope line.
 state.modelFailure=false;
 state.reply='Short version.';
 const briefReply=await answerGuidance('phone-one','summary please','brief-1');
 assert.equal(briefReply,'Short version.');
 assert.match(state.calls.at(-1).system,/summarise your previous answer/i);
 assert.equal(state.rows.get(guidanceKey('phone-one')).data.brief,'on');
 // No earlier answer: approved acknowledgement, no model call.
 const callsBeforeNew=state.calls.length;
 assert.equal(await answerGuidance('phone-brevity-new','Need summery','brief-2'),'Sure, I will keep replies short.');
 assert.equal(state.calls.length,callsBeforeNew);
 // Brief preference shortens normal answers until the user asks for detail.
 state.reply='First sentence here. Second sentence here. '+'word '.repeat(70);
 const trimmedReply=await answerGuidance('phone-one','Explain export insurance?','brief-3');
 assert.equal(trimmedReply,'First sentence here. Second sentence here.');
 assert.match(state.calls.at(-1).system,/Keep every reply to 3 short lines/);
 state.reply='A detailed answer.';
 assert.equal(await answerGuidance('phone-one','explain more','brief-4'),'A detailed answer.');
 assert.equal(state.rows.get(guidanceKey('phone-one')).data.brief,'');
 // Offline summary: the previous answer is trimmed locally, never the busy fallback.
 state.modelFailure=true;
 assert.equal(await answerGuidance('phone-one','too long','brief-5'),'A detailed answer.');
 

 // Trusted answers also carry the one-time language question for new users (message >= 2), then never again.
 const c1=await answerGuidance('phone-three','What is dlc','t1');assert.match(c1??'',/Documentary Letter of Credit/);assert.doesNotMatch(c1??'',/comfortable in/);
 const c2=await answerGuidance('phone-three','What is CIF?','t2');assert.match(c2??'',/Cost, Insurance and Freight/);assert.match(c2??'',/Which language are you most comfortable in\?/);
 assert.equal(state.rows.get(guidanceKey('phone-three')).data.languageAsked,'1');
 const c3=await answerGuidance('phone-three','Who founded UDC?','t3');assert.match(c3??'',/founded by Muhammed NP/);assert.doesNotMatch(c3??'',/comfortable in/);
  }finally{if(secret===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=secret;await unlink(path);delete (globalThis as any).__guidance;}
});
