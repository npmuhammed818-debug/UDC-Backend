import {test,afterEach} from "node:test";
import assert from "node:assert/strict";
import {toAnthropicToolRequest,runAnthropicToolChat} from "../src/akif/intelligence/anthropicToolClient.ts";
const oldFetch=globalThis.fetch,oldKey=process.env.ANTHROPIC_API_KEY,oldBase=process.env.ANTHROPIC_BASE_URL;
afterEach(()=>{globalThis.fetch=oldFetch;for(const [k,v] of [["ANTHROPIC_API_KEY",oldKey],["ANTHROPIC_BASE_URL",oldBase]]){if(v===undefined)delete process.env[k!];else process.env[k!]=v;}});
test("converts assistant tool use and user tool results with exact IDs and inputs",()=>{
 const r=toAnthropicToolRequest([{role:"system",content:"Identity and boundaries"},{role:"user",content:"check rice"},{role:"assistant",content:null,tool_calls:[{id:"c1",type:"function",function:{name:"lookup",arguments:'{"query":"rice"}'}}]},{role:"tool",tool_call_id:"c1",content:"sample only"},{role:"tool",tool_call_id:"c2",content:"other result"}], [{type:"function",function:{name:"lookup",description:"Reference lookup",parameters:{type:"object"}}}],"test-model");
 assert.equal(r.system,"Identity and boundaries");assert.equal(r.messages.length,3);assert.deepEqual(r.messages[1].content,[{type:"tool_use",id:"c1",name:"lookup",input:{query:"rice"}}]);assert.equal(r.messages[2].content.length,2);assert.equal(r.tools?.[0].input_schema.type,"object");
});
test("parses mixed text and tool calls without losing arguments",async()=>{
 process.env.ANTHROPIC_API_KEY="fake-only";delete process.env.ANTHROPIC_BASE_URL;
 globalThis.fetch=async(_u,init)=>{assert.equal(init?.redirect,"error");return Response.json({content:[{type:"text",text:"Checking."},{type:"tool_use",id:"c1",name:"lookup",input:{query:"rice"}}]});};
 const r=await runAnthropicToolChat([{role:"user",content:"rice"}],[],1000);assert.equal(r.content,"Checking.");assert.deepEqual(r.toolCalls,[{id:"c1",name:"lookup",argumentsJson:'{"query":"rice"}'}]);
});
test("provider failure reveals neither key nor error payload",async()=>{
 process.env.ANTHROPIC_API_KEY="fake-only";delete process.env.ANTHROPIC_BASE_URL;globalThis.fetch=async()=>Response.json({private:"detail"},{status:429});
 await assert.rejects(runAnthropicToolChat([{role:"user",content:"hi"}],[],1000),e=>{assert.equal((e as Error).message,"Anthropic returned HTTP 429");return true;});
});
test("missing key and malformed arguments fail before network",async()=>{
 delete process.env.ANTHROPIC_API_KEY;globalThis.fetch=async()=>{throw Error("unexpected fetch");};await assert.rejects(runAnthropicToolChat([],[],1000),/not configured/);
 assert.throws(()=>toAnthropicToolRequest([{role:"assistant",content:null,tool_calls:[{id:"a",type:"function",function:{name:"x",arguments:"null"}}]}],[],"test"),/Invalid tool arguments/);
});
