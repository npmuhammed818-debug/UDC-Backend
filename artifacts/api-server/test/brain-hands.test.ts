import {test,afterEach} from "node:test";
import assert from "node:assert/strict";
import {runHandsWork,deferHandsWork,isBrainHandsEnabled,runBrainModelToolChat,runHandsModelToolChat} from "../src/akif/intelligence/brainHands.ts";
const call=(name="read_deal_terms",args:Record<string,unknown>={})=>({id:"a",name,argumentsJson:JSON.stringify(args)});
const tools=[{type:"function" as const,function:{name:"read_deal_terms",description:"Read recorded terms",parameters:{type:"object"}}}];
const old={...process.env},oldFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=oldFetch;for(const k of ["AKIF_BRAIN_HANDS_ENABLED","AKIF_BRAIN_MODEL_PROVIDER","ANTHROPIC_API_KEY","ANTHROPIC_BASE_URL","GROQ_API_KEY","GROQ_BASE_URL"]){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
test("hybrid default is off",()=>{delete process.env.AKIF_BRAIN_HANDS_ENABLED;assert.equal(isBrainHandsEnabled(),false);});
test("hands runs selected tool via the existing executor",async()=>{
 let called=0;const r=await runHandsWork({requests:[call()],tools,hands:async()=>({content:null,toolCalls:[call()]}),execute:async()=>{called++;return {note:"No deal on record."};},timeoutMs:1000});
 assert.equal(called,1);assert.deepEqual(r.notes,["No deal on record."]);
});
test("hands cannot add a money tool, change arguments or repeat a call",async()=>{
 let called=0;const request=call("read_deal_terms",{deal:"original"});
 const r=await runHandsWork({requests:[request],tools,hands:async()=>({content:null,toolCalls:[call("pay_money"),call("read_deal_terms",{deal:"different"}),request,request]}),execute:async()=>{called++;return {note:"Recorded terms read."};},timeoutMs:1000});
 assert.equal(called,1);assert.equal(r.rejected,3);
});
test("hands can decline work without claiming success",async()=>{
 const r=await runHandsWork({requests:[call()],tools,hands:async()=>({content:"Cannot safely run it",toolCalls:[]}),execute:async()=>{throw Error("must not run");},timeoutMs:1000});assert.equal(r.executed,0);assert.match(r.notes.join(" "),/not run/);
});
test("executor failure is unverified and never retried",async()=>{
 let called=0;const r=await runHandsWork({requests:[call()],tools,hands:async()=>({content:null,toolCalls:[call()]}),execute:async()=>{called++;throw Error("private failure");},timeoutMs:1000});assert.equal(called,1);assert.match(r.notes.join(" "),/unverified/);assert.doesNotMatch(r.notes.join(" "),/private failure/);
});
test("deferred work does not hold up initial response and starts once",async()=>{
 let called=0,finish:(x:string)=>void=()=>{};const block=new Promise<string>(r=>finish=r);
 const start=deferHandsWork(async()=>{called++;return block;});
 const initial="Checking that.";assert.equal(initial,"Checking that.");assert.equal(called,0);
 const first=start(),second=start();assert.equal(first,second);await Promise.resolve();assert.equal(called,1);finish("done");assert.equal(await first,"done");assert.equal(await second,"done");
});
test("Groq is the no-Anthropic-key stand-in for both slots",async()=>{
 process.env.AKIF_BRAIN_HANDS_ENABLED="on";process.env.AKIF_BRAIN_MODEL_PROVIDER="anthropic";delete process.env.ANTHROPIC_API_KEY;process.env.GROQ_API_KEY="test-only";
 const urls:string[]=[];globalThis.fetch=async(u)=>{urls.push(String(u));return Response.json({choices:[{message:{content:"test"}}]});};
 await runBrainModelToolChat([{role:"user",content:"hi"}],[],1000);await runHandsModelToolChat([{role:"user",content:"hi"}],[],1000);assert.equal(urls.length,2);assert.ok(urls.every(u=>u.includes("groq.com")));
});
test("Claude slots choose Sonnet brain and Haiku hands when explicitly configured",async()=>{
 process.env.AKIF_BRAIN_HANDS_ENABLED="on";process.env.AKIF_BRAIN_MODEL_PROVIDER="anthropic";process.env.ANTHROPIC_API_KEY="test-only";delete process.env.ANTHROPIC_BASE_URL;
 const models:string[]=[];globalThis.fetch=async(_u,init)=>{models.push(JSON.parse(String(init?.body)).model);return Response.json({content:[{type:"text",text:"test"}]});};
 await runBrainModelToolChat([{role:"user",content:"hi"}],[],1000);await runHandsModelToolChat([{role:"user",content:"work"}],[],1000);assert.deepEqual(models,["claude-sonnet-4-5","claude-haiku-4-5"]);
});
