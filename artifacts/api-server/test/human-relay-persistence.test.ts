import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __clearRelayMemoryForTests,
  __setRelayPersistenceForTests,
  answerClaimedHumanRelayItem,
  claimHumanRelay,
  enqueueHumanRelay,
  hydrateHumanRelay,
  pendingHumanRelay,
  recentRelayRepliesFor,
  relayReplyResetsConversation,
  relayThreadFor,
  resetHumanRelay,
  type HumanRelayItem,
  type RelayPersistence,
} from "../src/akif/humanRelay.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeStore() {
  const rows: HumanRelayItem[] = [];
  const calls: string[] = [];
  const persistence: RelayPersistence = {
    async upsertItem(item) { calls.push("upsert"); const i = rows.findIndex((r) => r.id === item.id); if (i >= 0) rows[i] = { ...item }; else rows.push({ ...item }); },
    async markAnswered(ids, at, replyText) { calls.push("markAnswered"); for (const r of rows) if (ids.includes(r.id)) { r.answeredAt = at; if (replyText !== undefined) { r.preAnswerDraft = r.preAnswerDraft ?? r.draft; r.draft = replyText; } } },
    async markPhoneAnswered(phone, at, replyText) { calls.push("markPhoneAnswered"); for (const r of rows) if (r.phone === phone && !r.answeredAt) r.answeredAt = at; if (replyText !== undefined) { const mine = rows.filter((r) => r.phone === phone && r.answeredAt); const last = mine[mine.length - 1]; if (last) { last.preAnswerDraft = last.preAnswerDraft ?? last.draft; last.draft = replyText; } } },
    async setClaim(id, workerId, at) { calls.push("setClaim"); const r = rows.find((x) => x.id === id); if (r) { r.claimedBy = workerId; r.claimedAt = at; } },
    async releaseClaims(ids) { calls.push("releaseClaims"); for (const r of rows) if (ids.includes(r.id)) { r.claimedBy = undefined; r.claimedAt = undefined; } },
    async deleteItems(ids) { calls.push("deleteItems"); for (let i = rows.length - 1; i >= 0; i--) if (ids.includes(rows[i].id)) rows.splice(i, 1); },
    async deleteOlderThan(ttlMs) { calls.push("deleteOlderThan"); const cutoff = Date.now() - ttlMs; for (let i = rows.length - 1; i >= 0; i--) if (Date.parse(rows[i].at) < cutoff) rows.splice(i, 1); },
    async deleteAll() { calls.push("deleteAll"); rows.length = 0; },
    async fetchOpen(maxItems, ttlMs) {
      calls.push("fetchOpen");
      const cutoff = Date.now() - ttlMs;
      return rows.filter((r) => !r.answeredAt && Date.parse(r.at) >= cutoff).slice(0, maxItems).map((r) => ({ ...r }));
    },
    async fetchRecent(maxItems, ttlMs) {
      calls.push("fetchRecent");
      const cutoff = Date.now() - ttlMs;
      return rows.filter((r) => Date.parse(r.at) >= cutoff).slice(0, maxItems).map((r) => ({ ...r }));
    },
  };
  return { rows, calls, persistence };
}

test("relay queue writes through to persistence and hydrates after a restart", async () => {
  const { rows, calls, persistence } = fakeStore();
  __setRelayPersistenceForTests(persistence);
  resetHumanRelay();
  await flush();
  assert.ok(calls.includes("deleteAll"), "reset clears the stored queue");
  assert.equal(rows.length, 0);

  const item = enqueueHumanRelay({ phone: "+91 70220 32531", kind: "text", text: "synthetic persistence check", draft: "Hi, how can I help?" });
  await flush();
  assert.equal(rows.length, 1, "the held item is written through");
  assert.equal(rows[0].id, item.id);
  assert.equal(rows[0].phone, "917022032531");
  assert.equal(rows[0].draft, "Hi, how can I help?");

  const claimed = claimHumanRelay("worker-test");
  assert.equal(claimed?.id, item.id);
  await flush();
  assert.equal(rows[0].claimedBy, "worker-test", "the claim survives in the store");

  // Simulate the deploy that used to wipe the queue: memory gone, rows intact.
  __clearRelayMemoryForTests();
  assert.equal(pendingHumanRelay().length, 0, "memory is empty after the restart");

  const restored = await hydrateHumanRelay();
  assert.equal(restored, 1, "the open item is restored from the store");
  const pending = pendingHumanRelay();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, item.id);
  assert.equal(pending[0].claimedBy, "worker-test", "an in-flight claim is still honored after restart");

  const answered = answerClaimedHumanRelayItem(item.id, "worker-test");
  assert.equal(answered?.id, item.id);
  await flush();
  assert.ok(rows[0].answeredAt, "the answer is persisted");

  assert.equal(await hydrateHumanRelay(), 0, "answered items are not restored");
  assert.equal(pendingHumanRelay().length, 0);

  __setRelayPersistenceForTests(null);
  resetHumanRelay();
});

test("bot reply memory survives a restart and still blocks restatements", async () => {
  const { rows, persistence } = fakeStore();
  __setRelayPersistenceForTests(persistence);
  resetHumanRelay();
  __setRelayPersistenceForTests(persistence);

  const phone = "917022032531";
  const item = enqueueHumanRelay({ phone, kind: "text", text: "Give me more dtls about the commission and direct deal", draft: null });
  await flush();
  const claim = claimHumanRelay("worker-test");
  answerClaimedHumanRelayItem(claim!.id, "worker-test", "On commission, we only earn when a deal actually closes. The exact rates are not fixed yet. Buyer and seller deal directly, we just introduce them and help with the paperwork.");
  await flush();
  assert.ok(rows[0].answeredAt, "answer persisted");
  assert.equal(rows[0].draft, "On commission, we only earn when a deal actually closes. The exact rates are not fixed yet. Buyer and seller deal directly, we just introduce them and help with the paperwork.", "the sent reply is stored on the row");

  // Deploy wipes memory; the store keeps the whole thread.
  __clearRelayMemoryForTests();
  assert.equal(recentRelayRepliesFor(phone).length, 0, "memory empty after restart");
  await hydrateHumanRelay();
  assert.equal(pendingHumanRelay().length, 0, "nothing to answer again");
  const thread = relayThreadFor(phone);
  assert.equal(thread.length, 2, "customer line and bot line both restored");
  assert.equal(thread[0].from, "customer");
  assert.equal(thread[1].from, "akif");
  // The repeat guard has its memory back after the restart.
  assert.equal(relayReplyResetsConversation(phone, "On commission, we only earn when a deal closes. Rates are not fixed yet. Buyer and seller deal directly, we just introduce them and help with the paperwork."), true, "restatement still blocked after restart");

  __setRelayPersistenceForTests(null);
  resetHumanRelay();
});

test("a human reply snapshots the pre-claim draft instead of erasing it", async () => {
  const { rows, persistence } = fakeStore();
  __setRelayPersistenceForTests(persistence);
  resetHumanRelay();

  const phone = "917022032531";
  const item = enqueueHumanRelay({ phone, kind: "text", text: "price of copper?", draft: "Copper is around Rs 900/kg today, sir." });
  await flush();
  const claim = claimHumanRelay("worker-test");
  answerClaimedHumanRelayItem(claim!.id, "worker-test", "Copper is Rs 912/kg today.");
  await flush();
  assert.equal(rows[0].draft, "Copper is Rs 912/kg today.", "the sent reply replaces draft");
  assert.equal(rows[0].preAnswerDraft, "Copper is around Rs 900/kg today, sir.", "the pre-claim draft survives for attribution");

  // The app refuses a second answer to the same item (answeredAt guard), and
  // even if persistence were retried directly, the FIRST snapshot survives
  // (production SQL uses COALESCE(pre_answer_draft, draft)).
  assert.equal(answerClaimedHumanRelayItem(claim!.id, "worker-test", "Correcting: Rs 913/kg."), null, "a second answer to an answered item is refused");
  await persistence.markAnswered([rows[0].id], new Date().toISOString(), "Correcting: Rs 913/kg.");
  assert.equal(rows[0].draft, "Correcting: Rs 913/kg.");
  assert.equal(rows[0].preAnswerDraft, "Copper is around Rs 900/kg today, sir.", "a retried overwrite keeps the original snapshot");

  // A null draft snapshots as null, not as a crash.
  const item2 = enqueueHumanRelay({ phone, kind: "text", text: "and delivery?", draft: null });
  await flush();
  const claim2 = claimHumanRelay("worker-test");
  answerClaimedHumanRelayItem(claim2!.id, "worker-test", "Delivery in 3 days.");
  await flush();
  const row2 = rows.find((r) => r.id === item2.id)!;
  assert.equal(row2.draft, "Delivery in 3 days.");
  assert.equal(row2.preAnswerDraft ?? null, null, "no phantom snapshot when there was no draft");

  __setRelayPersistenceForTests(null);
  resetHumanRelay();
});
