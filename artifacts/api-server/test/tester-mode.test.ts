import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isTesterModeEnabled, isTesterPhone, normalizeTesterPhone, testerPhones } from '../src/auth/testerMode.ts';

async function loadPhoneRecovery() {
  const out = fileURLToPath(new URL('./tester-pr-' + randomUUID() + '.mjs', import.meta.url));
  const result = await build({ stdin: { contents: "export * from '../src/whatsapp/phoneRecovery';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, plugins: [{ name: 'pr-fixtures', setup(b) {
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'fx' }));
    b.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: 'orm', namespace: 'fx' }));
    b.onResolve({ filter: /auth\/(emailCodes|emailTransport|emailDelivery|emailAuth)$/ }, (a) => ({ path: a.path, namespace: 'fx' }));
    b.onResolve({ filter: /phoneFingerprint$/ }, () => ({ path: 'fp', namespace: 'fx' }));
    b.onLoad({ filter: /.*/, namespace: 'fx' }, (a) => ({ contents:
      a.path === 'db' ? 'export const db=null;' :
      a.path === 'orm' ? 'export const sql=(parts,...values)=>({text:String.raw(parts,...values),params:values});' :
      a.path === 'fp' ? 'export const guidedChatPhoneHash=(x)=>x;' :
      a.path.includes('emailAuth') ? 'export const emailAuth={ipBudget:async()=>{}};' :
      a.path.includes('emailCodes') ? 'export const EMAIL_CODE_ATTEMPTS=5;export const EMAIL_CODE_TTL_MS=600000;export const emailCodeHash=()=>"h";export const emailCodeMatches=()=>false;export const newEmailCode=()=>"000000";' :
      a.path.includes('emailTransport') ? 'export const deliverAuthEmail=async()=>{};' :
      'export const sendAuthEmail=async()=>{};' }));
  } }] });
  await writeFile(out, result.outputFiles[0].text);
  try { return await import(out); } finally { await unlink(out); }
}

function withEnv(patch: Record<string, string | undefined>, fn: () => unknown) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { return fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] as any; } }
}
const ENV = { UDC_TESTER_MODE: undefined, UDC_TESTER_PHONES: undefined, NODE_ENV: undefined, UDC_APP_ENV: undefined };

test('off by default and impossible in production', () => {
  withEnv({ ...ENV }, () => assert.equal(isTesterModeEnabled(), false));
  withEnv({ ...ENV, UDC_TESTER_MODE: 'on' }, () => assert.equal(isTesterModeEnabled(), true));
  withEnv({ ...ENV, UDC_TESTER_MODE: 'on', NODE_ENV: 'production' }, () => assert.equal(isTesterModeEnabled(), false));
  withEnv({ ...ENV, UDC_TESTER_MODE: 'on', UDC_APP_ENV: 'production' }, () => assert.equal(isTesterModeEnabled(), false));
});

test('only the allowlisted number is a tester, normalized to digits', () => {
  assert.equal(normalizeTesterPhone('+91 70220 32531'), '917022032531');
  withEnv({ ...ENV, UDC_TESTER_MODE: 'on', UDC_TESTER_PHONES: '917022032531' }, () => {
    assert.deepEqual(testerPhones(), ['917022032531']);
    assert.equal(isTesterPhone('+917022032531'), true);
    assert.equal(isTesterPhone('917022032531'), true);
    assert.equal(isTesterPhone('919999999999'), false);
    assert.equal(isTesterPhone(''), false);
    assert.equal(isTesterPhone(null), false);
  });
  withEnv({ ...ENV, UDC_TESTER_MODE: 'off', UDC_TESTER_PHONES: '917022032531' }, () => assert.equal(isTesterPhone('917022032531'), false));
});

test('tester sign-in links the phone with no email code; other numbers still need the code', async () => {
  const account = { id: 'u1', email: 'owner@example.invalid', verified_email: 'owner@example.invalid', email_verified_at: new Date('2026-01-01'), phone: null, status: 'verified', role: 'buyer' };
  const updates: any[] = [];
  const db: any = {
    execute: async (q: any) => {
      const s = String(q.text).replace(/\s+/g, ' ').toLowerCase().trim(); const v = q.params;
      if (s.startsWith('select pg_advisory_xact_lock')) return { rows: [] };
      if (s.startsWith('select id from public.users where phone=')) return { rows: [] };
      if (s.includes('from public.users where lower(email)=')) return { rows: [account].filter((u: any) => u.email === v[0]) };
      if (s.includes('count(*)::integer as n')) return { rows: [{ n: 99, latest: new Date() }] };
      if (s.startsWith('update public.users set phone=')) { updates.push({ phone: v[0], email: v[2], id: v[4] }); return { rows: [] }; }
      throw new Error('unexpected query: ' + s);
    },
    transaction: async (fn: any) => fn(db),
  };
  const noEmail: any[] = [];
  const send = async (...args: any[]) => { noEmail.push(args); };
  const { phoneRecoveryCommand, createPhoneRecoveryService } = await loadPhoneRecovery();
  assert.equal(phoneRecoveryCommand('sign in owner@example.invalid')?.kind, 'request');
  await withEnv({ ...ENV, UDC_TESTER_MODE: 'on', UDC_TESTER_PHONES: '917022032531' }, async () => {
    const service = createPhoneRecoveryService({ database: db, send, budget: async () => {} });
    const reply = await service.request('917022032531', 'owner@example.invalid');
    assert.match(String(reply), /Signed in \(tester mode\)/);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].phone, '917022032531');
    assert.equal(noEmail.length, 0, 'tester sign-in must send no email');
  });
  await withEnv({ ...ENV }, async () => {
    updates.length = 0;
    const service = createPhoneRecoveryService({ database: db, send, budget: async () => {} });
    const reply = await service.request('919999999999', 'owner@example.invalid');
    assert.doesNotMatch(String(reply), /tester mode/);
    assert.equal(updates.length, 0, 'non-tester numbers never get the bypass');
  });
});

test('wiring: registration skips the code and role switches are direct for the tester only', () => {
  const chat = readFileSync(new URL('../src/whatsapp/chatUi.ts', import.meta.url), 'utf8');
  assert.match(chat, /isTesterPhone\(phone\)/);
  assert.match(chat, /Email confirmed automatically \(tester mode\)/);
  assert.match(chat, /Role switched to \$\{target\} \(tester mode\)/);
  assert.match(chat, /tester_role_switch/);
  assert.match(chat, /'switch role':'change_role'/);
});
