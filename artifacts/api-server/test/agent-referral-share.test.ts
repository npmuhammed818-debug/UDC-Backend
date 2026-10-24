import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {randomUUID} from "node:crypto";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";

test("agent referral code is copy-ready and optional WhatsApp link cannot redirect",async()=>{
  const path=fileURLToPath(new URL(`./referral-share-${randomUUID()}.mjs`,import.meta.url));
  const built=await build({stdin:{
    contents:"export {agentReferralCode,agentReferralWhatsAppCommand,agentReferralWhatsAppLink} from '../src/referrals/invitation.ts';",
    resolveDir:fileURLToPath(new URL(".",import.meta.url)),
  },platform:"node",format:"esm",bundle:true,packages:"external",write:false});
  await writeFile(path,built.outputFiles[0].text);
  try{
    const m=await import(path);
    const agent="01234567-89ab-4cde-89ab-cdef12345678";
    const code=m.agentReferralCode(agent);
    assert.equal(code,"UDC-0123456789AB");
    assert.equal(m.agentReferralWhatsAppCommand(agent),"Referral "+code);
    for(const input of ["",null,undefined,0,"123","https://evil.example",agent+"\\nPAY MONEY"]){
      if(input===undefined||input===null||input===0||input==="")
        assert.equal(m.agentReferralWhatsAppLink(agent,input),null);
      else if(input===agent+"\\nPAY MONEY")
        assert.equal(m.agentReferralWhatsAppLink(input,"15551234567"),null);
      else assert.equal(m.agentReferralWhatsAppLink(agent,input),null);
    }
    for(const input of ["15551234567?text=FORGED","15551234567/","15551234567\\n",
      "1555@evil.example","+0005551234","111","1".repeat(18),"http://malicious.example"])
      assert.equal(m.agentReferralWhatsAppLink(agent,input),null,"invalid human number must be rejected: "+input);
    const link=m.agentReferralWhatsAppLink(agent,"+15551234567");
    assert.equal(link,"https://wa.me/15551234567?text=Referral%20UDC-0123456789AB");
    const url=new URL(link);
    assert.equal(url.protocol,"https:");assert.equal(url.hostname,"wa.me");
    assert.equal(url.searchParams.get("text"),"Referral "+code);
    assert.equal(m.agentReferralWhatsAppLink(agent,"15551234567"),link);
    assert.equal(m.agentReferralWhatsAppLink(agent,""),null);
    assert.throws(()=>m.agentReferralWhatsAppCommand("not-a-uuid"),/invalid_agent_id/);
  }finally{await unlink(path);}
});
