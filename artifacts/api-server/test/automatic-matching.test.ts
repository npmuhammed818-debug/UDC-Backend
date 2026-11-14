import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('automatic matching starts once, prevents overlapping batches and rotates bounded pages',async()=>{
 const key='__automaticMatchingFixture',state:any={offsets:[],presented:[],timers:[],errors:[],requests:Array.from({length:20},(_,i)=>({id:'requirement-'+i}))};
 let release:any;state.gate=new Promise(resolve=>{release=resolve});
 const query:any={from:()=>query,where:()=>query,orderBy:()=>query,limit:(n:number)=>{assert.equal(n,20);return query},offset:(n:number)=>{state.offsets.push(n);return state.gate.then(()=>state.requests.slice(n,n+20));}};state.db={select:()=>query};(globalThis as any)[key]=state;
 const output=fileURLToPath(new URL('./automatic-matching-'+randomUUID()+'.mjs',import.meta.url));
 const bundle=await build({stdin:{contents:"export * from '../src/marketplace/automaticMatching';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'matching-boundaries',setup(b){
  b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^drizzle-orm$/},()=>({path:'orm',namespace:'fixture'}));b.onResolve({filter:/termAgreement$/},()=>({path:'present',namespace:'fixture'}));b.onResolve({filter:/sellerRequirementNotify$/},()=>({path:'notify',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='db'?`export const db=globalThis.${key}.db;export const buyerRequestsTable={id:'id',status:'status',createdAt:'createdAt'};`:args.path==='orm'?'export const eq=(a,b)=>({a,b});export const asc=x=>x;':args.path==='notify'?`export const notifyMatchingSellers=async id=>{(globalThis.${key}.notified??=[]).push(id);};`:`export const presentInitialVerifiedOffer=async id=>{globalThis.${key}.presented.push(id);};`}));
 }}]});await writeFile(output,bundle.outputFiles[0].text);
 const original=globalThis.setInterval;
 (globalThis as any).setInterval=(callback:any,ms:number)=>{assert.equal(ms,30000);const timer={callback,unref:()=>{}};state.timers.push(timer);return timer;};
 try{
  const {startAutomaticMatching}=await import(output);const log={error:(...args:any[])=>state.errors.push(args)};startAutomaticMatching(log);startAutomaticMatching(log);assert.equal(state.timers.length,1);assert.equal(state.offsets.length,1);
  state.timers[0].callback();assert.equal(state.offsets.length,1);release();await new Promise(setImmediate);assert.equal(state.presented.length,20);assert.equal(state.notified.length,20,'approved requirements are also notified to matching sellers');
  state.timers[0].callback();await new Promise(setImmediate);assert.deepEqual(state.offsets,[0,20]);state.timers[0].callback();await new Promise(setImmediate);assert.deepEqual(state.offsets,[0,20,0]);assert.equal(state.errors.length,0);
 }finally{globalThis.setInterval=original;await unlink(output);delete (globalThis as any)[key];}
});
