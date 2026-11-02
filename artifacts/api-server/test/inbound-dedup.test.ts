import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('durable inbound claims fail closed on outages and reject invalid ids', async () => {
  const state = { failure: false, insertCalls: 0, hashes: new Set<string>() };
  (globalThis as any).__dedupFixture = state;
  const result = await build({
    entryPoints: [new URL('../src/whatsapp/inboundDedup.ts', import.meta.url).pathname],
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{name:'dedup-db-fixture',setup(b) {
      b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
        const s=globalThis.__dedupFixture;
        export const whatsappInboundDedupTable={};
        export const db={insert(){s.insertCalls++;let hash;return {values(v){hash=v.idHash;return this},onConflictDoUpdate(){return this},async returning(){if(s.failure)throw Object.assign(Error('fixture private outage'),{code:s.failure});if(s.hashes.has(hash))return [];s.hashes.add(hash);return [{idHash:hash}]}}},delete(){return {where(){return Promise.resolve()}}}};
      `,loader:'js'}));
    }}],
  });
  const file = new URL(`./dedup-fixture-${randomUUID()}.mjs`, import.meta.url);
  try {
    await writeFile(file,result.outputFiles[0].text);
    const m=await import(file.href);
    for (const invalid of [null,undefined,23,'','short','x'.repeat(201)]) assert.equal(await m.claimInboundMessage(invalid),false);
    assert.equal(state.insertCalls,0);
    assert.equal(await m.claimInboundMessage('synthetic-message-1'),true);
    assert.equal(await m.claimInboundMessage('synthetic-message-1'),false);
    for (const code of ['08006','42P01']) {
      state.failure=code;
      await assert.rejects(m.claimInboundMessage('synthetic-message-2'), {name:'InboundDedupUnavailable',message:'inbound_dedup_unavailable'});
    }
    state.failure=false;
    assert.equal(await m.claimInboundMessage('synthetic-message-2'),true,'retry works after persistence recovers');
  } finally { await unlink(file).catch(()=>{}); delete (globalThis as any).__dedupFixture; }
});
