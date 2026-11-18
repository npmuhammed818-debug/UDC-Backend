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
        export const READ_ONLY_SQLSTATE='25006';
        export const whatsappInboundDedupTable={};
        export const dbTransaction=(run)=>db?.transaction?db.transaction(run):run(db);export const db={insert(){s.insertCalls++;let hash;return {values(v){hash=v.idHash;return this},onConflictDoUpdate(){return this},async returning(){if(s.failure)throw Object.assign(Error('fixture private outage'),{code:s.failure});if(s.hashes.has(hash))return [];s.hashes.add(hash);return [{idHash:hash}]}}},delete(){return {where(){return Promise.resolve()}}}};
        export const dbWrite=async(run)=>run(db);
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
    // Attempt discipline on the claim path (18 Nov outage: 4 outer attempts x
    // dbWrite's inner 2 = 8 write attempts per webhook while the 25006 state
    // persisted). A 25006 stops after ONE dbWrite call - the inner evict+pinned
    // retry already ran inside it - while transient codes keep all 4.
    state.insertCalls=0;
    state.failure='25006';
    await assert.rejects(m.claimInboundMessage('synthetic-message-3'), {name:'InboundDedupUnavailable'});
    assert.equal(state.insertCalls,1,'25006: no outer retry multiplication (one dbWrite call; its inner retry is inside)');
    state.insertCalls=0;
    state.failure='08006';
    await assert.rejects(m.claimInboundMessage('synthetic-message-3'), {name:'InboundDedupUnavailable'});
    assert.equal(state.insertCalls,4,'transient codes still use all 4 claim attempts');
    state.insertCalls=0;
    state.failure=false;
    assert.equal(await m.claimInboundMessage('synthetic-message-3'),true,'recovers after the outage clears');
  } finally { await unlink(file).catch(()=>{}); delete (globalThis as any).__dedupFixture; }
});
