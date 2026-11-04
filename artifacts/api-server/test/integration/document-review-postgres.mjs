// Explicit isolated loopback database only. No hosted DBs or external sends.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const {default:pg}=await import(new URL('../../../../lib/db/node_modules/pg/lib/index.js',import.meta.url));
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const url=new URL(process.env.UDC_REVIEW_QA_DATABASE_URL||'http://missing.invalid');
assert.ok(['postgres:','postgresql:'].includes(url.protocol));
assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
assert.match(url.pathname,/^\/udc_qa_review_[a-z0-9_]+$/);
assert.equal(url.searchParams.get('sslmode'),'disable');
for(const key of Object.keys(process.env))if(/^(SUPABASE_|WHATSAPP_|AKIF_|SESSION_SECRET)/.test(key))delete process.env[key];
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=await mkdtemp(tmpdir()+'/udc-review-sql-');
const schema='review_'+randomUUID().replaceAll('-','');
const control=new pg.Client({connectionString:url.href});await control.connect();
await control.query(`create schema ${schema}`);
url.searchParams.set('options',`-c search_path=${schema}`);
process.env.SUPABASE_DATABASE_URL=url.href;
const competitor=new pg.Client({connectionString:url.href});await competitor.connect();
let app,server,origin='';
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{assert.equal(new URL(String(input)).origin,origin,'no external requests');return originalFetch(input,init);};
try{
 await build({stdin:{contents:"import express from 'express';import picture from './src/routes/dealStatusPicture';export const http=express();http.use((req,res,next)=>{req.authUser=globalThis.testReviewPrincipal;next();});http.use(picture);export {reviewRepository as r,reviewVerificationRepository as v} from './src/documentReview/repository';export {pool} from '@workspace/db';",resolveDir:root},outfile:directory+'/repository.mjs',bundle:true,platform:'node',format:'esm',external:['pg-native'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'synthetic-storage',setup(b){b.onResolve({filter:/supabase\/storage$/},()=>({path:'storage',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:"export async function downloadDocumentBytes(){return {bytes:new TextEncoder().encode('%PDF-synthetic'),contentType:'application/pdf'}}",loader:'js'}));}}]});
 app=await import(pathToFileURL(directory+'/repository.mjs').href);
 const {r,v,pool}=app;
 await pool.query(`CREATE TABLE users(id uuid primary key,role text,status text);CREATE TABLE deals(id uuid primary key,buyer_user_id uuid,seller_user_id uuid,deal_number text default 'SYNTHETIC-001',status text default 'shipment',updated_at timestamptz default now());CREATE TABLE deal_participants(id uuid primary key,deal_id uuid,user_id uuid,participant_role text,status text);CREATE TABLE documents(id uuid primary key,deal_id uuid,document_type text,file_url text,updated_at timestamptz,status text);CREATE TABLE document_access(id uuid primary key,document_id uuid,user_id uuid);CREATE TABLE audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz default now() not null);`);
 const u=randomUUID(),seller=randomUUID(),d=randomUUID(),doc=randomUUID();
 await pool.query("insert into users values($1,'buyer','verified'),($2,'seller','verified')",[u,seller]);await pool.query('insert into deals(id,buyer_user_id,seller_user_id) values($1,$2,$3)',[d,u,seller]);
 await pool.query("insert into documents values($1,$2,'LC',$3,now(),'approved')",[doc,d,`storage://udc-documents/deals/${d}/synthetic.pdf`]);await pool.query('insert into document_access values(gen_random_uuid(),$1,$2)',[doc,u]);
 const allowed=await r.loadAllowed(u,doc);assert.ok(allowed);assert.equal(await r.loadAllowed(seller,doc),null);
 const link={id:'synthetic-link',tokenHash:'a'.repeat(64),userId:u,documentId:doc,version:allowed.version,expiresAt:Date.now()+120000};await r.save(link);assert.equal((await r.find(link.tokenHash)).userId,u);
 assert.equal(await r.recordReceipt(link,u),'recorded');assert.equal(await r.recordReceipt(link,u),'already_recorded');
 await pool.query('delete from document_access where user_id=$1',[u]);assert.equal(await r.recordReceipt(link,u),'unavailable');
 const now=Date.now(),c={id:randomUUID(),linkHash:link.tokenHash,userId:u,browserHash:'b'.repeat(64),codeHash:'c'.repeat(64),expiresAt:now+120000,attempts:0,consumed:false};assert.equal(await v.reserve(c,'ip',now),true);assert.equal(await v.reserve({...c,id:randomUUID()},'ip',now),false);
 const session={userId:'',hash:'d'.repeat(64),expiresAt:now+10000};assert.equal(await v.consume(c.id,c.browserHash,c.linkHash,'e'.repeat(64),session,now),false);assert.equal(await v.consume(c.id,c.browserHash,c.linkHash,c.codeHash,session,now),true);assert.equal(await v.consume(c.id,c.browserHash,c.linkHash,c.codeHash,session,now),false);assert.equal(await v.session(session.hash,now),u);assert.equal(await v.session(session.hash,now+10000),null);await v.revokeSession(session.hash);assert.equal(await v.session(session.hash,now),null);
 // Revoke-first transaction and receipt use separate native PG connections.
 await pool.query('insert into document_access values(gen_random_uuid(),$1,$2)',[doc,u]);
 await competitor.query('begin');await competitor.query('delete from document_access where user_id=$1',[u]);
 const raced=r.recordReceipt({...link,id:'race-link'},u);await new Promise(resolve=>setTimeout(resolve,100));await competitor.query('commit');assert.equal(await raced,'unavailable');
 await pool.query('insert into document_access values(gen_random_uuid(),$1,$2)',[doc,u]);
 const current=await r.loadAllowed(u,doc),parallel={...link,id:'parallel-link',version:current.version};assert.deepEqual((await Promise.all([r.recordReceipt(parallel,u),r.recordReceipt(parallel,u)])).sort(),['already_recorded','recorded']);
 assert.equal((await pool.query("select count(*)::int n from audit_logs where action='document_review_receipt' and metadata->>'linkId'='parallel-link'")).rows[0].n,1);

 process.env.UDC_APP_ENV='staging';server=app.http.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;
 globalThis.testReviewPrincipal={id:u,role:'buyer',status:'verified'};
 let response=await fetch(origin+'/deals/'+d+'/status-picture');assert.equal(response.status,200);assert.match(await response.text(),/SHIPMENT/);assert.equal(response.headers.get('cache-control'),'no-store');
 globalThis.testReviewPrincipal={id:randomUUID(),role:'buyer',status:'verified'};assert.equal((await fetch(origin+'/deals/'+d+'/status-picture')).status,404);
 globalThis.testReviewPrincipal={id:u,role:'agent',status:'verified'};assert.equal((await fetch(origin+'/deals/'+d+'/status-picture')).status,403);
 globalThis.testReviewPrincipal={id:u,role:'buyer',status:'pending'};assert.equal((await fetch(origin+'/deals/'+d+'/status-picture')).status,403);
 globalThis.testReviewPrincipal={id:u,role:'buyer',status:'verified'};process.env.UDC_APP_ENV='production';assert.equal((await fetch(origin+'/deals/'+d+'/status-picture')).status,404);
 console.log('PASS status picture actual HTTP/SQL: own deal allowed, outsider hidden, agent/pending denied, production route disabled.');
 console.log('PASS document review actual repository SQL: access, receipt, OTP budgets/attempt/single-use/expiry/logout, revoke-first race and parallel receipt dedup. Synthetic storage; isolated native PostgreSQL only.');
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;await competitor.query('rollback').catch(()=>{});await competitor.end();await app?.pool.end();await control.query(`drop schema ${schema} cascade`);await control.end();await rm(directory,{recursive:true,force:true});
}
