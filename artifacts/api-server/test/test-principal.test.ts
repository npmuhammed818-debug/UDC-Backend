import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestPrincipal, isOwnerTestPrincipal, crossesTestBoundary, OWNER_TEST_USER_ID } from '../src/testPrincipal.ts';

const owner = { id: OWNER_TEST_USER_ID, phone: '+917994133604', email: 'x@gmail.com' };
async function env(v: string | undefined, fn: () => void) {
  const s = process.env.UDC_APP_ENV;
  if (v === undefined) delete process.env.UDC_APP_ENV; else process.env.UDC_APP_ENV = v;
  try { fn(); } finally { if (s === undefined) delete process.env.UDC_APP_ENV; else process.env.UDC_APP_ENV = s; }
}
test('owner principal needs id, phone and staging', async () => {
  await env('staging', () => {
    assert.equal(isOwnerTestPrincipal(owner), true);
    assert.equal(isOwnerTestPrincipal({ ...owner, phone: '+919999999999' }), false);
    assert.equal(isOwnerTestPrincipal({ ...owner, id: '00000000-0000-0000-0000-000000000000' }), false);
  });
});
test('outside staging nothing is a test principal (fail closed)', async () => {
  for (const v of [undefined, 'production', '']) await env(v, () => {
    assert.equal(isTestPrincipal(owner), false);
    assert.equal(isTestPrincipal({ id: 'a', email: 'f@udc-test.invalid' }), false);
  });
});
test('email suffix alone never makes a synthetic fixture (no trusted registry yet)', async () => {
  await env('staging', () => {
    assert.equal(isTestPrincipal({ id: 'a', email: 'f1@udc-test.invalid' }), false);
    assert.equal(isTestPrincipal({ id: 'a', email: 'f1@udc-test.com' }), false);
  });
});
test('crossing between test and real principals is detected both ways', async () => {
  await env('staging', () => {
    const real = { id: 'r', phone: '+911', email: 'r@x.com' };
    assert.equal(crossesTestBoundary(owner, real), true);
    assert.equal(crossesTestBoundary(real, owner), true);
    assert.equal(crossesTestBoundary(owner, { id: 'f', email: 'f@udc-test.invalid' }), true);
    assert.equal(crossesTestBoundary(real, { id: 'r2', email: 'r2@x.com' }), false);
  });
});
