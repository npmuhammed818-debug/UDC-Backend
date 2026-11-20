import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Passive webhook diagnostic (staging flag UDC_WHATSAPP_DIAG_RECEIPTS): the
// classifier, the flag gate, fail-silent persistence with the in-memory ring
// fallback, the dedup failure-row write, retention purge and the admin snapshot.
// No real database or provider calls: @workspace/db is an isolated fixture.
test('webhook diagnostic: classification, flag gating, fail-silent writes, retention', async () => {
  const state = {
    inserts: [] as any[],
    updates: [] as any[],
    deletes: 0,
    failWrites: false as boolean | string,
  };
  (globalThis as any).__diagFixture = state;
  const result = await build({
    entryPoints: [new URL('../src/whatsapp/webhookDiag.ts', import.meta.url).pathname],
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{ name: 'diag-db-fixture', setup(b) {
      b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        const s = globalThis.__diagFixture;
        const maybeFail = () => {
          if (!s.failWrites) return;
          const code = typeof s.failWrites === 'string' ? s.failWrites : '25006';
          throw Object.assign(new Error('fixture private outage'), { code });
        };
        export const whatsappWebhookReceiptsTable = {};
        export const whatsappInboundDedupTable = {};
        export const READ_ONLY_SQLSTATE = '25006';
        export const db = {};
        export const dbWrite = async (run) => run({
          insert: () => ({ values(v) { maybeFail(); s.inserts.push(v); return Promise.resolve(); } }),
          update: () => ({ set(v) { return { where() { maybeFail(); s.updates.push(v); return Promise.resolve(); } }; } }),
          delete: () => ({ where() { maybeFail(); s.deletes++; return Promise.resolve(); } }),
        });
      `, loader: 'js' }));
      // The dedup module imports @workspace/db too; the same fixture serves it.
    }}] });
  const file = new URL(`./diag-fixture-${randomUUID()}.mjs`, import.meta.url);
  const savedFlag = process.env.UDC_WHATSAPP_DIAG_RECEIPTS;
  try {
    await writeFile(file, result.outputFiles[0].text);
    const m = await import(file.href);

    // Payload classification: class + item count, no content retained.
    assert.deepEqual(m.classifyWebhookPayload({ entry: [{ changes: [{ value: { statuses: [{ id: 'x' }, { id: 'y' }] } }] }] }),
      { payloadClass: 'statuses', itemCount: 2 });
    assert.deepEqual(m.classifyWebhookPayload({ entry: [{ changes: [{ value: { messages: [{ id: 'm1' }] } }] }] }),
      { payloadClass: 'messages', itemCount: 1 });
    assert.deepEqual(m.classifyWebhookPayload({ entry: [{ changes: [{ value: { statuses: [{}], messages: [{}] } }] }] }),
      { payloadClass: 'mixed', itemCount: 2 });
    assert.deepEqual(m.classifyWebhookPayload({ entry: [] }), { payloadClass: 'unknown', itemCount: 0 });
    assert.deepEqual(m.classifyWebhookPayload(undefined), { payloadClass: 'unknown', itemCount: 0 });
    assert.deepEqual(m.classifyWebhookPayload({ entry: 'garbage' }), { payloadClass: 'unknown', itemCount: 0 });

    // Error classes: SQLSTATE wins over the name, names are bounded, text never leaks.
    assert.equal(m.errorClassOf(Object.assign(new Error('some private detail'), { code: '25006' })), '25006');
    assert.equal(m.errorClassOf(Object.assign(new Error('outer'), { cause: { code: '55P03' } })), '55P03');
    assert.equal(m.errorClassOf(new RangeError('x')), 'RangeError');
    assert.equal(m.errorClassOf('not-an-error'), 'unknown');
    assert.ok(m.errorClassOf(Object.assign(new Error('x'), { code: 'Z'.repeat(200) })).length <= 40);

    // Flag OFF: nothing is written and no failure can escape.
    delete process.env.UDC_WHATSAPP_DIAG_RECEIPTS;
    await m.recordWebhookReceipt({ payloadClass: 'messages', itemCount: 1, handlerOutcome: '200', signed: true });
    await m.recordInboundFailure(['synthetic-message-1'], 'processing', new Error('x'));
    await m.purgeOldWebhookReceipts();
    assert.equal(state.inserts.length, 0, 'flag off: no receipt insert');
    assert.equal(state.updates.length, 0, 'flag off: no failure-row update');
    assert.equal(state.deletes, 0, 'flag off: no purge delete');
    assert.equal(m.diagSnapshot().enabled, false);

    // Flag ON: a receipt row is persisted with class/count/outcome/signed only.
    process.env.UDC_WHATSAPP_DIAG_RECEIPTS = '1';
    await m.recordWebhookReceipt({ payloadClass: 'statuses', itemCount: 3, handlerOutcome: '200', signed: true });
    assert.equal(state.inserts.length, 1);
    assert.deepEqual(state.inserts[0], { payloadClass: 'statuses', itemCount: 3, handlerOutcome: '200', signed: true });

    // A failing database must not break the ack path: the write failure is
    // counted and drops into the in-memory ring instead of throwing.
    state.failWrites = '25006';
    await m.recordWebhookReceipt({ payloadClass: 'messages', itemCount: 1, handlerOutcome: '200', signed: true });
    assert.equal(state.inserts.length, 1, 'failed write does not retry or throw');
    let snap = m.diagSnapshot();
    assert.equal(snap.receiptWriteFailures, 1);
    assert.equal(snap.ring.length, 1);
    assert.equal(snap.ring[0].kind, 'receipt_write_failed');
    assert.equal(snap.ring[0].errorClass, '25006');
    state.failWrites = false;

    // Failure-row persistence marks where a claimed message stopped (hashed ids only).
    await m.recordInboundFailure(['synthetic-message-9'], 'brain', Object.assign(new Error('boom'), { code: '08006' }));
    assert.equal(state.updates.length, 1);
    assert.equal(state.updates[0].failedStage, 'brain');
    assert.equal(state.updates[0].errorClass, '08006');
    assert.ok(state.updates[0].failedAt instanceof Date);
    await m.recordInboundFailure(['bad', null, 42], 'processing', new Error('x'));
    assert.equal(state.updates.length, 1, 'invalid ids are skipped without a write');

    // The failure-row write itself fails silently into the ring.
    state.failWrites = true;
    await m.recordInboundFailure(['synthetic-message-9'], 'processing', new Error('x'));
    snap = m.diagSnapshot();
    assert.equal(snap.receiptWriteFailures, 2);
    assert.equal(snap.ring.at(-1).kind, 'failure_row_write_failed');

    // Retention purge runs only under the flag and is fail-silent too.
    await m.purgeOldWebhookReceipts();
    assert.equal(state.deletes, 0, 'purge failure swallowed while db down');
    assert.equal(snap.ring.at(-1) && m.diagSnapshot().ring.at(-1).kind, 'receipt_purge_failed');
    state.failWrites = false;
    await m.purgeOldWebhookReceipts();
    assert.equal(state.deletes, 1);

    // The ring is bounded at 50 entries.
    state.failWrites = true;
    for (let i = 0; i < 80; i += 1) await m.recordWebhookReceipt({ payloadClass: 'unknown', itemCount: 0, handlerOutcome: '401', signed: false });
    assert.equal(m.diagSnapshot().ring.length, 50, 'ring is bounded');
    state.failWrites = false;
  } finally {
    if (savedFlag === undefined) delete process.env.UDC_WHATSAPP_DIAG_RECEIPTS; else process.env.UDC_WHATSAPP_DIAG_RECEIPTS = savedFlag;
    await unlink(file).catch(() => {});
    delete (globalThis as any).__diagFixture;
  }
});
