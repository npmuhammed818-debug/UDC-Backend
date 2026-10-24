import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";

test("UDC six-digit OTP Resend adapter fails closed, never leaks secrets, and accepts only a receipt ID",async()=>{
 const filepath=fileURLToPath(new URL(`./resend-otp-${randomUUID()}.mjs`,import.meta.url));
 const bundle=await build({
  stdin:{contents:"export {createResendAuthSender,makeAuthEmailText,resendTransportConfigured,validateResendConfig} from '../src/auth/resendAuthProvider.ts';export {sendAuthEmail} from '../src/auth/emailDelivery.ts';",
    resolveDir:fileURLToPath(new URL(".",import.meta.url))},
  format:"esm",bundle:true,packages:"external",platform:"node",write:false,
 });
 await writeFile(filepath,bundle.outputFiles[0].text);
 const names=["RESEND_API_KEY","UDC_AUTH_EMAIL_TRANSPORT","UDC_AUTH_EMAIL_SEND_ENABLED",
  "UDC_AUTH_EMAIL_FROM","UDC_AUTH_EMAIL_VERIFIED_DOMAIN","SESSION_SECRET"];
 const original=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 try{
  for(const name of names)delete process.env[name];
  const mod=await import(filepath);
  const code="012345",key="re_qa_fake_api_key_123456",session="S".repeat(52);
  const config={apiKey:key,from:"UDC Security <otp@udc-example.test>",
    verifiedDomain:"udc-example.test",idempotencySecret:session};
  const message={to:"test.recipient@example.test",code,purpose:"verify_email",
    expiresAt:new Date("2026-10-24T10:10:00Z")};
  assert.equal(mod.validateResendConfig(config),true);
  assert.equal(mod.validateResendConfig({...config,verifiedDomain:"other.example"}),false);
  assert.equal(mod.validateResendConfig({...config,from:"otp@resend.dev",verifiedDomain:"resend.dev"}),false);
  assert.equal(mod.validateResendConfig({...config,apiKey:"not-a-provider-key"}),false);
  assert.equal(mod.validateResendConfig({...config,idempotencySecret:"weak"}),false);
  assert.equal(mod.resendTransportConfigured(),false);
  await assert.rejects(mod.sendAuthEmail(message,new AbortController().signal),/email_delivery_unavailable/);

  process.env.RESEND_API_KEY=key;
  process.env.UDC_AUTH_EMAIL_TRANSPORT="resend";
  process.env.UDC_AUTH_EMAIL_FROM=config.from;
  process.env.UDC_AUTH_EMAIL_VERIFIED_DOMAIN=config.verifiedDomain;
  process.env.SESSION_SECRET=session;
  assert.equal(mod.resendTransportConfigured(),false,"API keys alone must not activate delivery");
  await assert.rejects(mod.sendAuthEmail(message,new AbortController().signal),/email_delivery_unavailable/);
  process.env.UDC_AUTH_EMAIL_SEND_ENABLED="false";
  assert.equal(mod.resendTransportConfigured(),false);
  process.env.UDC_AUTH_EMAIL_SEND_ENABLED="true";
  assert.equal(mod.resendTransportConfigured(),true);
  delete process.env.UDC_AUTH_EMAIL_SEND_ENABLED;

  const requests:any[]=[];
  const fetcher=async(url:any,options:any)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({id:"916a0d0f-2ea6-4a48-81d6-8471f637d971"}),
      {status:200,headers:{"content-type":"application/json"}});
  };
  const sender=mod.createResendAuthSender(config,fetcher);
  const controller=new AbortController();
  await sender(message,controller.signal);
  await sender(message,controller.signal);
  assert.equal(requests.length,2);
  for(const {url,options} of requests){
    assert.equal(url,"https://api.resend.com/emails");
    assert.equal(options.method,"POST");assert.equal(options.redirect,"error");
    assert.equal(options.referrerPolicy,"no-referrer");
    assert.equal(options.signal,controller.signal);
    assert.equal(options.headers.authorization,"Bearer "+key);
    const payload=JSON.parse(options.body);
    assert.equal(payload.from,config.from);
    assert.deepEqual(payload.to,[message.to]);
    assert.match(payload.text,/012345/);
    assert.doesNotMatch(payload.text,/PRIVATE_SECRET/);
    assert.equal(payload.html,undefined,"text only: no links or tracking pixels");
    assert.match(options.headers["idempotency-key"],/^[a-f0-9]{64}$/);
    assert.ok(!options.headers["idempotency-key"].includes(code));
    assert.ok(!options.headers["idempotency-key"].includes(message.to));
  }
  assert.equal(requests[0].options.headers["idempotency-key"],
    requests[1].options.headers["idempotency-key"],"same exact request is idempotent");
  const changed={...message,code:"012346"};
  await sender(changed,controller.signal);
  assert.notEqual(requests[0].options.headers["idempotency-key"],
    requests.at(-1).options.headers["idempotency-key"],"new code must have different idempotency");
  const reset={...message,purpose:"reset_password"};
  await sender(reset,controller.signal);
  assert.match(JSON.parse(requests.at(-1).options.body).subject,/password/i);
  const recovery={...message,purpose:"link_phone"};
  await sender(recovery,controller.signal);
  assert.match(JSON.parse(requests.at(-1).options.body).subject,/WhatsApp/i);
  const abort=new AbortController();abort.abort();
  const previous=requests.length;
  await assert.rejects(sender(message,abort.signal),/email_delivery_unavailable/);
  assert.equal(requests.length,previous);
  await assert.rejects(sender({...message,code:"ABCDEF"},controller.signal),/invalid_auth_email/);
  assert.equal(requests.length,previous);

  for(const [codeStatus,payload] of [[403,{error:"SECRET "+key+" "+code}],
    [429,{error:"quota: "+message.to}], [500,{error:"internal"}]]){
    const rejected=mod.createResendAuthSender(config,async()=>
      new Response(JSON.stringify(payload),{status:codeStatus}));
    await assert.rejects(rejected(message,controller.signal),e=>{
      assert.equal(e.message,"email_delivery_unavailable");
      assert.ok(!e.message.includes(key));assert.ok(!e.message.includes(code));
      return true;
    });
  }
  const missingId=mod.createResendAuthSender(config,async()=>new Response('{"ok":true}',{status:200}));
  await assert.rejects(missingId(message,controller.signal),/email_delivery_unavailable/);
  const malformed=mod.createResendAuthSender(config,async()=>new Response("<html>secret</html>",{status:200}));
  await assert.rejects(malformed(message,controller.signal),/email_delivery_unavailable/);
  const huge=mod.createResendAuthSender(config,async()=>new Response("x".repeat(5000),{status:200}));
  await assert.rejects(huge(message,controller.signal),/email_delivery_unavailable/);
  const throws=mod.createResendAuthSender(config,async()=>{throw Error("PRIVATE "+key);});
  await assert.rejects(throws(message,controller.signal),e=>e.message==="email_delivery_unavailable");
 }finally{
   for(const n of names)original[n]===undefined?delete process.env[n]:process.env[n]=original[n];
   await unlink(filepath);
 }
});
