import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('exit reason list choice is routed before menu-specific branch and prompted only after successful closure',async()=>{
 const s=await readFile(new URL('../src/routes/whatsappWebhook.ts',import.meta.url),'utf8');assert.ok(s.indexOf('if(await handleExitReason(message.from,exitId))')<s.indexOf("if(message.from && message.interactive && chatAction(message)==='menu')"));assert.ok(s.includes("pauseRequest.kind==='close'&&result.applied"));
});
