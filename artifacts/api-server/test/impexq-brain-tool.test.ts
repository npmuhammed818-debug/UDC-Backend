import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { impexqBrainTools, runImpexqBrainTool } from "../src/akif/intelligence/impexqBrainTool.ts";
const originalFetch = globalThis.fetch;
const originalKey = process.env.IMPEXQ_API_KEY;
afterEach(() => { globalThis.fetch=originalFetch; if(originalKey===undefined)delete process.env.IMPEXQ_API_KEY; else process.env.IMPEXQ_API_KEY=originalKey; });
test("tool hidden without key", () => { delete process.env.IMPEXQ_API_KEY; assert.equal(impexqBrainTools().length,0); });
test("mock numbers withheld from brain for all three sample endpoints", async () => {
 process.env.IMPEXQ_API_KEY="unit-test-only";
 globalThis.fetch=async()=>Response.json({_sandbox:true,_mock:true,rate:17.12345});
 assert.equal(impexqBrainTools().length,1);
 for(const tool of ["hsn","rodtep","calculator"]){
 const out=await runImpexqBrainTool({tool,query:"basmati rice",...(tool==="calculator"?{cifValue:5000}:{})});
 assert.match(out.note,/SAMPLE ONLY/); assert.doesNotMatch(out.note,/17\.12345/);
 }
});
test("FTA retains reference caveat and source",async()=>{
 process.env.IMPEXQ_API_KEY="unit-test-only";
 globalThis.fetch=async()=>Response.json({_sandbox:true,_mock:false,agreement:"CEPA"});
 const out=await runImpexqBrainTool({tool:"fta",query:"rice",destination:"uae"});
 assert.match(out.note,/not a verified rate/);assert.match(out.note,/CEPA/);assert.match(out.note,/impexq.com/);
});
test("private identifiers and missing inputs never reach provider",async()=>{
 globalThis.fetch=async()=>{throw Error("unexpected fetch");};
 for(const args of [{tool:"hsn",query:"email me@test.com"},{tool:"fta",query:"rice"},{tool:"calculator",query:"rice"}]){
 const out=await runImpexqBrainTool(args);assert.match(out.note,/not run/);
 }
});
test("provider failures never become guessed numbers",async()=>{
 process.env.IMPEXQ_API_KEY="unit-test-only";globalThis.fetch=async()=>Response.json({}, {status:429});
 const out=await runImpexqBrainTool({tool:"hsn",query:"rice"});assert.match(out.note,/unavailable or rate-limited/);
});
