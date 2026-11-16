import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { stripDashBreaks, sanitizeRelayReplyText, RELAY_REPLY_STYLE_NOTE } from "../src/akif/humanRelay.ts";

// Owner direction, 10 Nov: workers are the only conversation voice; dashes
// never reach customers; stale intake drafts must not bypass the human relay.

test("dash stripper catches spaced AND unspaced em/en dashes, keeps hyphenated words", () => {
  assert.equal(stripDashBreaks("I'm here—what would you like to talk about today?"), "I'm here, what would you like to talk about today?");
  assert.equal(stripDashBreaks("Sure thing—feel free"), "Sure thing, feel free");
  assert.equal(stripDashBreaks("word – word"), "word, word");
  assert.equal(stripDashBreaks("word - word"), "word, word");
  assert.equal(stripDashBreaks("single-use link and 6-digit code"), "single-use link and 6-digit code");
  assert.equal(sanitizeRelayReplyText("a—b"), "a, b");
});

test("worker style note carries the no-dash, grief and doclink rules", () => {
  assert.match(RELAY_REPLY_STYLE_NOTE, /dash/i);
  assert.match(RELAY_REPLY_STYLE_NOTE, /grief|pause business/i);
  assert.match(RELAY_REPLY_STYLE_NOTE, /doclink/);
  assert.match(RELAY_REPLY_STYLE_NOTE, /never collect documents over chat/i);
});

test("an intake draft older than a day is stale and stops bypassing the relay", async () => {
  const names = ["whatsappIntakeDraftsTable"];
  const tables: any = Object.fromEntries(names.map(n => [n, new Proxy({ _table: n }, { get: (_, k) => k === "_table" ? n : { column: k, table: n } })]));
  const state: any = { row: null as any };
  function select() { let c: any; const q: any = { from: () => q, where: (v: any) => { c = v; return q; }, limit: () => q, then: (resolve: any, reject: any) => Promise.resolve().then(() => (state.row ? [state.row] : [])).then(resolve, reject) }; return q; }
  const db = { select };
  (globalThis as any).__intakeFixture = { db, tables, state };
  const output = fileURLToPath(new URL(`./intake-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({ stdin: { contents: "export { loadWhatsAppIntakeDraft, INTAKE_DRAFT_TTL_MS } from '../src/akif/whatsappIntakeStore';", resolveDir: fileURLToPath(new URL(".", import.meta.url)) }, platform: "node", format: "esm", bundle: true, packages: "external", write: false, plugins: [{ name: "intake-fixture", setup(b) {
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
    b.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "orm", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "db"
      ? "const s=globalThis.__intakeFixture;export const db=s.db;export const whatsappIntakeDraftsTable=s.tables.whatsappIntakeDraftsTable;"
      : "export const eq=(a,b)=>({kind:'eq',a,b});" }));
  } }] });
  await writeFile(output, bundle.outputFiles[0].text);
  try {
    const m = await import(output);
    assert.equal(await m.loadWhatsAppIntakeDraft("910000000001"), null);
    state.row = { phone: "910000000001", role: "buyer", draft: {}, updatedAt: new Date(Date.now() - 60 * 60_000) };
    assert.equal((await m.loadWhatsAppIntakeDraft("910000000001")).stale, false, "fresh draft is live");
    state.row = { phone: "910000000001", role: "buyer", draft: {}, updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) };
    assert.equal((await m.loadWhatsAppIntakeDraft("910000000001")).stale, true, "8-day-old draft is stale");
    state.row = { phone: "910000000001", role: "buyer", draft: {}, updatedAt: "not-a-date" };
    assert.equal((await m.loadWhatsAppIntakeDraft("910000000001")).stale, true, "unparseable timestamp is stale, never silently live");
  } finally { await unlink(output); }
});
