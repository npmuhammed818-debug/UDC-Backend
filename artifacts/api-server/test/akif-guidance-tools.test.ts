import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const FIXTURE_XLSX_B64 = 'UEsDBBQAAAAIANwOYV2WDB/5pwAAAAEBAAAPAAAAeGwvd29ya2Jvb2sueG1sjY87DoMwDIavEvkADWXogHgsXRgq9QopmCaCxJGdvm7fCMreybY+/Z/tunv7RT2RxVFo4HgooGvrF/F8I5pVhkEasCnFSmsZLHojB4oYMpmIvUl55LuWyGhGsYjJL7osipP2xgXYDBX/46BpcgOeaXh4DGmTMC4m5dPEuijQ1usG+VUVjMcGLhSSXT7qyjkuoFbWjw2UoLhyueF+LEG3td7jev+w/QJQSwMEFAAAAAgA3A5hXR3wJZ6GAAAAugAAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1VOOQ7DMAz7iqEHRG6GDkXszFmLfMBIVDvIYUMSevy+RqdmIkUSFLv+vW/mSSxLPhxcGgu97+60Ba2CpKWIqYlDHCTVckOUKdEepMmFjuo8Mu9B68kRS5jWEAlba6/I/x1w7jTD7ICHuQUzfgo50EoCR1IHr8yrJCIV/EHb1C+AvsPTKv8FUEsDBBQAAAAIANwOYV1PaSEY8QAAAKwCAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDIueG1sdZLhboMgFEZfxfAAgFZUFqRZuxchjs2mRQwQu8cf05bcEfuDBO53OPeGII4/5lYs2vmLnXpUYoqOUtytu/pR61DEdPI9GkOY3wjxw6iN8tjOeorJl3VGhXh038TPTqvP9ZK5kYrShhh1mZAUa+1DBSWFs/fCxS6xOvxt3ktUhB75eF4kFWSRggxxRS7BdYJrAJf7MEswA3CV4DU7wezwPzvDrN5v0jybnBoAs0wEs2Zf1KZpWwC32bTt9jq4zhpsdUYpfvFyXdJ3QN9l+u6hP2TBeQtY9dLPk58DP8/8/Dl+mfn5Y36GWeYn4MuQ9BflL1BLAwQUAAAACADcDmFdW1HSBNoAAACIAQAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1sdZDdSgMxEEZfZVgUKixNXOiikqag3orFVno9bsZN6CZZkvHv7c3ihbDVy+98M8Nh1ObTD/BOKbsY1tXlUlYbrXJmKDzkdWWZxxshcmfJY17GkUJpXmPyyCWmXuQxEZpsidgPopGyFR5dqMoZpxXrQ0yDgVsMR7iL3kfj+Au2yXUE98gIi70l2LpS76YbF0qwVmLa/dl/Hg0yGYgBHjuOL5RANjU0smnno/O8e+sx1fAxGcy7pyJQw96ig9U5zNvFmTj2JyqF+lPBYrJ6kFd/4PZffP2LRfm2/gZQSwECFAMUAAAACADcDmFdlgwf+acAAAABAQAADwAAAAAAAAAAAAAAgAEAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQDFAAAAAgA3A5hXR3wJZ6GAAAAugAAABoAAAAAAAAAAAAAAIAB1AAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQDFAAAAAgA3A5hXU9pIRjxAAAArAIAABgAAAAAAAAAAAAAAIABkgEAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbFBLAQIUAxQAAAAIANwOYV1bUdIE2gAAAIgBAAAUAAAAAAAAAAAAAACAAbkCAAB4bC9zaGFyZWRTdHJpbmdzLnhtbFBLBQYAAAAABAAEAA0BAADFAwAAAAA=';

test('guidance AI tools: commodity reference answer and translation run deterministic paths', async()=>{
 const state:any={rows:new Map(), calls:[], reply:'കൊച്ചി പോർട്ട് 500 MT', modelFailure:false};
 const query:any={from:(table:any)=>{query.table=table;return query;},where:(x:any)=>{query.key=x.b;return query;},limit:async()=>query.table?.phone==='phone'?(state.account?[state.account]:[]):state.rows.has(query.key)?[state.rows.get(query.key)]:[]};
 state.db={select:()=>query,insert:()=>({values:(v:any)=>({onConflictDoUpdate:async()=>{state.rows.set(v.phoneHash,v);}})})};
 (globalThis as any).__guidance=state;
 const path=fileURLToPath(new URL('./guidance-tools-'+randomUUID()+'.mjs',import.meta.url));
 const result=await build({stdin:{contents:"export * from '../src/whatsapp/guidance';export * from '../src/akif/udcHandbook';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'guidance-fixtures',setup(b){
 b.onResolve({filter:/^@workspace\/db$|^drizzle-orm$|hermesClient(\.ts)?$|customerMemory(\.ts)?$|sharedLessons(\.ts)?$|emotionContext(\.ts)?$|taskPlanner(\.ts)?$|reflexion(\.ts)?$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('reflexion')?"export const reflectOnReply=()=>null;export const recordSelfLesson=async()=>({status:'stored'});":a.path.includes('taskPlanner')?"export const looksLikeComplexGoal=t=>/help me (import|export|buy|sell)/i.test(t);export const isApprovalReply=t=>/^(yes|yes please|go ahead|proceed|do it|ok)[.! ]*$/i.test(t.trim());export const isStatusQuestion=t=>/\\b(status|progress)\\b/i.test(t);export const planTask=async o=>{const s=globalThis.__guidance;s.plans=(s.plans||[]).concat([o]);return s.planResult??null;};export const readOpenTasks=async()=>{const s=globalThis.__guidance;return s.tasks??[];};export const approveStep=async o=>{const s=globalThis.__guidance;s.approvals=(s.approvals||[]).concat([o]);return {ok:true,step:{label:'Contact the seller',state:'in_progress',gated:true,approved:true}};};export const completeStep=async()=>({ok:true});export const cancelTask=async()=>true;export const formatPlanForCustomer=(g,steps)=>'PLAN::'+steps.map(x=>x.label).join('|');export const formatTasksForPrompt=ts=>ts.length?'TASKS::'+ts.map(t=>t.goal+'='+t.state).join('|'):'';":a.path.includes('emotionContext')?"export const estimateCustomerEmotion=async()=>({valence:'negative',cues:['anger'],confidence:0.6,evidence:'why'});export const feelingEventFor=()=> 'ordinary_turn';export const loadAkifFeelings=async()=>({state:{},lastTrigger:null});export const recordAkifFeeling=async o=>{const s=globalThis.__guidance;s.emotions=(s.emotions||[]).concat([o]);return {warmth:0.6,grief:0,tension:0.2,trust:0.5,engagement:0.6,uncertainty:0.3};};export const formatEmotionalContextForPrompt=()=>'EMOTION::ctx';":a.path.includes('sharedLessons')?"export const recallSharedLessons=async o=>{const s=globalThis.__guidance;s.sharedRecalls=(s.sharedRecalls||[]).concat([o]);return s.shared??[];};export const formatSharedLessonsForPrompt=m=>m.length?'SHARED::'+m.map(x=>x.content).join('|'):'';export const learnSharedLesson=async o=>{const s=globalThis.__guidance;s.sharedLearn=(s.sharedLearn||[]).concat([o]);return {status:'approved',id:'sl1'};};export const withdrawSharedLessons=async o=>{const s=globalThis.__guidance;s.withdrawn=(s.withdrawn||[]).concat(o.ids);return o.ids.length;};":a.path.includes('customerMemory')?"export const recallCustomerMemories=async o=>{const s=globalThis.__guidance;s.recalls=(s.recalls||[]).concat([o]);return s.memories??[];};export const formatMemoriesForPrompt=m=>m.length?'REMEMBERED::'+m.map(x=>x.content).join('|'):'';export const saveCustomerMemory=async o=>{const s=globalThis.__guidance;s.corrections=(s.corrections||[]).concat([o]);if(o.sharedLearner)await o.sharedLearner({userId:o.userId,topic:o.kind,content:o.content});return {id:'m1'};};":a.path==='@workspace/db'?"export const db=globalThis.__guidance.db;export const whatsappChatSessionsTable={phoneHash:'hash'};export const usersTable={role:'role',status:'status',phone:'phone'};":a.path==='drizzle-orm'?"export const eq=(a,b)=>({a,b});":"export const runConversationChat=async(message,system)=>{const s=globalThis.__guidance;s.calls.push({message,system});if(s.modelFailure)throw Error('MODEL_UNAVAILABLE');return {content:s.reply};};"}));
 }}]});await writeFile(path,result.outputFiles[0].text);
 const fixture=Buffer.from(FIXTURE_XLSX_B64,'base64');
 const savedSecret=process.env.WHATSAPP_APP_SECRET;process.env.WHATSAPP_APP_SECRET='test-guidance-tools-secret-123';
 const fetchCalls:string[]=[];
 (globalThis as any).fetch=async(url:any)=>{fetchCalls.push(String(url));if(String(url).includes('commodity-markets'))return new Response('no link');return new Response(fixture);};
 try{
 const {answerGuidance,isGuidanceQuestion}=await import(path);
 assert.equal(isGuidanceQuestion('translate this offer to malayalam'),true);
 assert.equal(isGuidanceQuestion('what is the sugar price today?'),true);
 // Commodity: deterministic reference answer, no model call.
 const before=state.calls.length;
 const sugar=await answerGuidance('phone-tools','what is the sugar price today?','t1');
 assert.match(sugar??'',/0\.41 USD per kg/);
 assert.match(sugar??'',/not a live deal quote/);
 assert.equal(state.calls.length,before,'commodity answer must not call the model');
 // Unknown commodity stays on the model path.
 state.reply='UDC will confirm current prices for that product.';
 const other=await answerGuidance('phone-tools','what is the cardamom price?','t2');
 assert.equal(other,'UDC will confirm current prices for that product.');
 // Translation: parsed request goes to the strict translator, not the tutor.
 state.reply='കൊച്ചി പോർട്ട് 500 MT';
 const tr=await answerGuidance('phone-tools','translate CIF Kochi port 500 MT to malayalam','t3');
 assert.equal(tr,'കൊച്ചി പോർട്ട് 500 MT');
 assert.match(state.calls.at(-1).system,/ONLY the translation/);
 // A failed translator gives the honest busy line.
 const failState=state;failState.modelFailure=true;
 const busy=await answerGuidance('phone-tools','translate payment by DLC to tamil','t4');
 assert.match(busy??'',/translation service is busy/);
 }finally{if(savedSecret===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=savedSecret;await unlink(path);}
});
