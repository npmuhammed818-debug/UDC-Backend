import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('Akif guidance remembers language and follow-ups without verification or trade writes; voice actions stay unconfirmed', async()=>{
 const state:any={rows:new Map(), calls:[], reply:'അതെ, മലയാളത്തിൽ സംസാരിക്കാം.'};
 const query:any={from:(table:any)=>{query.table=table;return query;},where:(x:any)=>{query.key=x.b;return query;},limit:async()=>query.table?.phone==='phone'?(state.account?[state.account]:[]):state.rows.has(query.key)?[state.rows.get(query.key)]:[]};
 state.db={select:()=>query,insert:()=>({values:(v:any)=>({onConflictDoUpdate:async()=>{assert.ok(['profile_buyer','profile_seller','profile_agent','buyer','seller'].includes(v.purpose),'must respect the deployed SQL CHECK constraint');if(state.saveFailure)throw Error('PRIVATE_DATABASE_FAILURE');state.rows.set(v.phoneHash,v);}})})};
 (globalThis as any).__guidance=state;
 const path=fileURLToPath(new URL('./guidance-'+randomUUID()+'.mjs',import.meta.url));
 const result=await build({stdin:{contents:"export * from '../src/whatsapp/guidance';export * from '../src/akif/udcHandbook';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'guidance-fixtures',setup(b){
 b.onResolve({filter:/^@workspace\/db$|^drizzle-orm$|hermesClient$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='@workspace/db'?"export const db=globalThis.__guidance.db;export const whatsappChatSessionsTable={phoneHash:'hash'};export const usersTable={role:'role',status:'status',phone:'phone'};":a.path==='drizzle-orm'?"export const eq=(a,b)=>({a,b});":"export const runConversationChat=async(message,system)=>{globalThis.__guidance.calls.push({message,system});return {content:globalThis.__guidance.reply};};"}));
 }}]});await writeFile(path,result.outputFiles[0].text);
 const secret=process.env.WHATSAPP_APP_SECRET;process.env.WHATSAPP_APP_SECRET='test-guidance-secret-123';
 try{
 const {answerGuidance,isGuidanceQuestion,guidanceKey,validateGuidanceReply,trustedGuidanceAnswer}=await import(path);
 for(const text of ['What is dlc','Which payment method is safe for me?','Even for ur to answer and question?','Can you speak in malayalam?','എന്ത് ആണ് DLC?'])assert.equal(isGuidanceQuestion(text),true,text);
 assert.equal(isGuidanceQuestion('Deal UDC-123: accept offer?'),false);
 assert.equal(isGuidanceQuestion('100 MT copper at 5900'),false);
 await answerGuidance('phone-one','Can you speak in malayalam?','1');
 state.reply='DLC വിശദീകരണം';assert.equal(await answerGuidance('phone-one','What is dlc','2'),state.reply);
 let last=state.calls.at(-1);assert.match(last.system,/Preferred reply language: malayalam/);let prompt=JSON.parse(last.message);assert.equal(prompt.currentMessage,'What is dlc');assert.equal(prompt.history[0].content,'Can you speak in malayalam?');
 const count=state.calls.length;assert.equal(await answerGuidance('phone-one','What is dlc','2'),'');assert.equal(state.calls.length,count);
 await answerGuidance('phone-two','Explain export insurance?','3');assert.deepEqual(JSON.parse(state.calls.at(-1).message).history,[]);
 state.reply='You can ask learning questions before verification.';await answerGuidance('phone-one','Even to answer a question?','4');assert.match(JSON.parse(state.calls.at(-1).message).history.at(-1).content,/വിശദീകരണം/);
 state.reply='അതെ';await answerGuidance('phone-one','മലയാളത്തിൽ സംസാരിക്കാമോ?','5',true);assert.equal(JSON.parse(state.calls.at(-1).message).source,'voice_transcript');
 const before=state.rows.get(guidanceKey('phone-one'));state.reply='TRADE_ACTION';assert.equal(await answerGuidance('phone-one','Accept the seller offer','6',true),null);assert.equal(state.rows.get(guidanceKey('phone-one')),before);
 const oldHistory=state.rows.get(guidanceKey('phone-two'));oldHistory.data.handbookVersion='old';oldHistory.data.history=JSON.stringify([{role:'assistant',content:'UDC means Uniform Document Code'}]);
 await answerGuidance('phone-two','Tell me more about export insurance','history-reset');assert.deepEqual(JSON.parse(state.calls.at(-1).message).history,[]);
 for(const unsafe of ['UDC means Uniform Document Code.','Upload a passport and bank statement.','DLC is guaranteed safe.','Our website is https://fake.example/','long '.repeat(120)])assert.equal(validateGuidanceReply(unsafe),false,unsafe);
 assert.equal(trustedGuidanceAnswer('Who founded Apple?'),null);
 assert.equal(trustedGuidanceAnswer('Deal UDC-123: accept offer'),null);
 state.reply='UDC means Uniform Document Code.';
 const facts=await answerGuidance('phone-public','What is UDC?','public-1');assert.match(facts,/UpDownCircle/);assert.doesNotMatch(facts,/Uniform/);
 assert.match(await answerGuidance('phone-public','Who is the founder?','public-2'),/Muhammed NP/);
 assert.match(await answerGuidance('phone-public','Give me our company website','public-3'),/https:\/\/updowncircle.pages.dev\//);
 assert.match(await answerGuidance('phone-public','Full form of akif','public-4'),/Advanced Knowledge and Intelligent Framework/);
 assert.match(await answerGuidance('phone-public','What documents do I need for verification?','public-5'),/company registration or trade-license PDF/);
 assert.match(await answerGuidance('phone-public','What is DLC?','public-6'),/Banks examine documents, not the actual goods/);
 const redirected=await answerGuidance('phone-public','Can you code a website?','public-7');assert.match(redirected,/trade assistant/);
 const guarded=await answerGuidance('phone-public','Explain export insurance?','public-8');assert.doesNotMatch(guarded,/Uniform/);
 state.account={role:'agent',status:'pending'};assert.match(await answerGuidance('phone-public','What documents do I need for verification?','public-9'),/personal or business email/);state.account=null;
 state.reply='The safest choice is guaranteed safe.';assert.doesNotMatch(await answerGuidance('phone-public','Explain export insurance?','public-10'),/guaranteed safe/);
 state.reply='The answer remains available.';state.saveFailure=true;assert.equal(await answerGuidance('phone-three','Explain export insurance?','7',true),state.reply);assert.equal(state.rows.size,3);assert.ok(![...state.rows.keys()].some(k=>k.includes('phone')));
 }finally{if(secret===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=secret;await unlink(path);delete (globalThis as any).__guidance;}
});
