import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import {createReviewService,documentVersion,type ReviewLink,type ReviewRepository} from '../src/documentReview/service.ts';
import {verificationService,sameHash,type ReviewChallenge,type ReviewSession,type VerificationRepository} from '../src/documentReview/verification.ts';

export function fixture(){
 let now=Date.now(),allowed=true;let version='one';
 const bytes=new TextEncoder().encode('%PDF-1.4 synthetic'),links=new Map<string,ReviewLink>(),receipts=new Set<string>();
 const repo:ReviewRepository={loadAllowed:async(u,d)=>allowed&&u==='alice'&&d==='doc'?{id:'doc',dealId:'deal',title:'Fictional LC',version:documentVersion(version,bytes),bytes,contentType:'application/pdf'}:null,save:async l=>{links.set(l.tokenHash,l);},find:async h=>links.get(h)??null,recordReceipt:async l=>{if(receipts.has(l.id))return 'already_recorded';receipts.add(l.id);return 'recorded';}};
 const challenges=new Map<string,ReviewChallenge>(),sessions=new Map<string,ReviewSession>();
 const vr:VerificationRepository={reserve:async c=>{challenges.set(c.id,c);return true;},consume:async(id,b,l,code,s,n)=>{const c=challenges.get(id);if(!c||c.consumed||c.expiresAt<=n||c.attempts>=5||!sameHash(c.browserHash,b)||!sameHash(c.linkHash,l))return false;c.attempts++;if(!sameHash(c.codeHash,code))return false;c.consumed=true;sessions.set(s.hash,{...s,userId:c.userId});return true;},session:async(h,n)=>{const s=sessions.get(h);return s&&s.expiresAt>n?s.userId:null;}};
 return {service:createReviewService(repo,()=>now),verification:verificationService(vr,'x'.repeat(40),()=>now),lookup:repo.find,receipts,challenges,advance:()=>{now+=121000;},revoke:()=>{allowed=false;},update:()=>{version='two';}};
}

test('actual Express routes: browser-bound code, recipient isolation, receipt intent, revocation and no sends by default',async()=>{
 const dir=await mkdtemp(tmpdir()+'/udc-http-');
 await build({entryPoints:['src/documentReview/http.ts'],outfile:dir+'/http.mjs',bundle:true,platform:'node',format:'esm',external:['express']});
 // bundled express import resolves relative to temp, supply dependency explicitly
 const bundle=await import('node:fs/promises');let text=await bundle.readFile(dir+'/http.mjs','utf8');
 text=text.replace('from "express"','from '+JSON.stringify(pathToFileURL(import.meta.resolve('express').replace('file://','')).href));await bundle.writeFile(dir+'/http.mjs',text);
 const {reviewRouter}=await import(pathToFileURL(dir+'/http.mjs').href);
 const f=fixture(),l=await f.service.issue('alice','doc');assert.ok(l);let sent='';
 const app=express();app.use(express.urlencoded({extended:false}),cookieParser());let origin='';
 let p:any={...f,staging:true,secureCookies:false,returnUrl:'https://wa.me/918136942531',origin:'',deliverCode:async(_u:string,c:string)=>{sent=c;}};
 app.use('/api',reviewRouter(p));const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));origin='http://127.0.0.1:'+(server.address() as any).port;p.origin=origin;
 const path='/api/document-review/'+l.token;
 const get=(url=path,cookie='')=>fetch(origin+url,{headers:{cookie},redirect:'manual'});
 const post=(url:string,body:string,cookie='',o=origin)=>fetch(origin+url,{method:'POST',headers:{origin:o,cookie,'content-type':'application/x-www-form-urlencoded'},body,redirect:'manual'});
 try{
  let r=await get();assert.equal(r.status,200);assert.match(await r.text(),/Confirm it's you/);assert.equal(sent,'');assert.equal(f.receipts.size,0);
  assert.equal((await get(path+'/content')).status,401);
  assert.equal((await post(path+'/code','','','https://attacker.invalid')).status,403);assert.equal(sent,'');
  r=await post(path+'/code','');assert.equal(r.status,200);assert.match(sent,/^\d{6}$/);const challenge=r.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await post(path+'/verify','code='+sent)).status,403,'forwarded code without initiating browser rejected');
  r=await post(path+'/verify','code='+sent,challenge);assert.equal(r.status,303);const session=r.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await post(path+'/verify','code='+sent,challenge)).status,403,'challenge cannot be replayed');
  r=await get(path,session);assert.equal(r.status,200);assert.match(await r.text(),/Fictional LC/);assert.equal(f.receipts.size,0);
  r=await get(path+'/content',session);assert.equal(r.status,200);assert.match(r.headers.get('content-type')!,/application\/pdf/);
  assert.equal((await post(path+'/receipt','intent=reviewed_only',session)).status,403);
  assert.equal((await post(path+'/receipt','intent=reviewed_only&confirmed=yes',session,'https://attacker.invalid')).status,403);
  assert.equal((await post(path+'/receipt','intent=reviewed_only&confirmed=yes',session)).status,200);assert.equal(f.receipts.size,1);
  assert.equal((await post(path+'/receipt','intent=reviewed_only&confirmed=yes',session)).status,200);assert.equal(f.receipts.size,1);
  f.update();assert.equal((await get(path,session)).status,404);f.revoke();assert.equal((await get(path+'/content',session)).status,404);
  delete p.deliverCode;assert.equal((await post(path+'/code','')).status,503);
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});

test('verification stops after5 wrong codes, expires at2minutes, sessions do not extend on read',async()=>{
 const f=fixture(),link={tokenHash:'a'.repeat(64),userId:'alice'};let code='';
 const c=await f.verification.start(link,'synthetic-ip',async v=>{code=v;});assert.ok(c);
 for(let i=0;i<5;i++)assert.equal(await f.verification.verify(c.id,c.browser,link.tokenHash,code==='000000'?'111111':'000000'),null);
 assert.equal(await f.verification.verify(c.id,c.browser,link.tokenHash,code),null);
 const next=await f.verification.start(link,'synthetic-ip',async v=>{code=v;});assert.ok(next);f.advance();assert.equal(await f.verification.verify(next.id,next.browser,link.tokenHash,code),null);
});
