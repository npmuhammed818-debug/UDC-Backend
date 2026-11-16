import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixtureUserIds, isStagingEnv, isSyntheticFixture, isTestPrincipal, isTestWorldId,
  isOwnerTestPrincipal, sameWorldIds, OWNER_TEST_USER_ID, OWNER_TEST_PHONE_DIGITS,
} from '../src/testPrincipal.ts';
import {
  assertSameWorld, TestBoundaryError, TEST_BOUNDARY_ERROR,
  testWorldPair, testWorldCounterpartyRowsOk,
} from '../src/testBoundary.ts';

const FIXTURE_BUYER = '11111111-1111-1111-1111-111111111111';
const FIXTURE_SELLER = '22222222-2222-2222-2222-222222222222';
const REAL_USER = '33333333-3333-3333-3333-333333333333';
const REAL_USER_2 = '44444444-4444-4444-4444-444444444444';
const owner = { id: OWNER_TEST_USER_ID, phone: '+917994133604', email: 'owner@gmail.com' };

async function withEnv(env: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const keys = ['UDC_APP_ENV', 'UDC_TEST_WORLD', 'SUPABASE_URL', 'SUPABASE_DATABASE_URL', 'UDC_TEST_FIXTURE_IDS', 'UDC_OWNER_TEST_SWITCH'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    const value = env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await fn(); } finally {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const WORLD = { UDC_APP_ENV: 'production', UDC_TEST_WORLD: '1', SUPABASE_URL: 'https://lfqmfozvdaszpbbropqo.supabase.co', SUPABASE_DATABASE_URL: 'postgres://postgres.lfqmfozvdaszpbbropqo:pw@aws-0-x.pooler.supabase.com:6543/postgres' };
const stagingWithFixtures = {
  ...WORLD,
  UDC_TEST_FIXTURE_IDS: `${FIXTURE_BUYER}, ${FIXTURE_SELLER.toUpperCase()},junk-entry,${OWNER_TEST_USER_ID}`,
};

test('fixture registry parses only valid non-owner uuids, staging only', async () => {
  await withEnv(stagingWithFixtures, () => {
    assert.deepEqual(fixtureUserIds().sort(), [FIXTURE_BUYER, FIXTURE_SELLER].sort());
  });
  await withEnv({ UDC_APP_ENV: 'production', UDC_TEST_FIXTURE_IDS: FIXTURE_BUYER }, () => {
    assert.deepEqual(fixtureUserIds(), []);
    assert.equal(isStagingEnv(), false);
  });
  await withEnv({ ...WORLD }, () => {
    assert.deepEqual(fixtureUserIds(), []);
  });
});

test('fixture identity comes only from the registry, never from email or name', async () => {
  await withEnv(stagingWithFixtures, () => {
    assert.equal(isSyntheticFixture({ id: FIXTURE_BUYER }), true);
    assert.equal(isSyntheticFixture({ id: REAL_USER, email: 'test-buyer@udc-test.invalid' }), false);
    assert.equal(isSyntheticFixture({ id: REAL_USER, email: 'x@udc-test.invalid' }), false);
    assert.equal(isSyntheticFixture({ id: OWNER_TEST_USER_ID }), false);
    assert.equal(isTestPrincipal({ id: FIXTURE_SELLER }), true);
  });
});

test('isTestWorldId covers owner account and fixtures, fail closed outside staging', async () => {
  await withEnv(stagingWithFixtures, () => {
    assert.equal(isTestWorldId(OWNER_TEST_USER_ID), true);
    assert.equal(isTestWorldId(OWNER_TEST_USER_ID.toUpperCase()), true);
    assert.equal(isTestWorldId(FIXTURE_BUYER), true);
    assert.equal(isTestWorldId(REAL_USER), false);
    assert.equal(isTestWorldId(null), false);
    assert.equal(isTestWorldId(undefined), false);
  });
  await withEnv({ UDC_APP_ENV: 'production', UDC_TEST_FIXTURE_IDS: FIXTURE_BUYER }, () => {
    assert.equal(isTestWorldId(OWNER_TEST_USER_ID), false);
    assert.equal(isTestWorldId(FIXTURE_BUYER), false);
    assert.equal(sameWorldIds(OWNER_TEST_USER_ID, FIXTURE_BUYER), true); // both real-world outside staging
  });
});

test('sameWorldIds and assertSameWorld split every mixed pair, allow every same pair', async () => {
  await withEnv(stagingWithFixtures, () => {
    assert.equal(sameWorldIds(OWNER_TEST_USER_ID, FIXTURE_BUYER, FIXTURE_SELLER), true);
    assert.equal(sameWorldIds(REAL_USER, REAL_USER_2), true);
    assert.equal(sameWorldIds(OWNER_TEST_USER_ID, REAL_USER), false);
    assert.equal(sameWorldIds(FIXTURE_SELLER, REAL_USER), false);
    assert.equal(sameWorldIds(REAL_USER, FIXTURE_BUYER), false);
    assert.equal(sameWorldIds(OWNER_TEST_USER_ID), true);
    assert.equal(sameWorldIds(OWNER_TEST_USER_ID, null), true);
    assert.doesNotThrow(() => assertSameWorld(OWNER_TEST_USER_ID, FIXTURE_BUYER));
    assert.doesNotThrow(() => assertSameWorld(REAL_USER, REAL_USER_2));
    assert.throws(() => assertSameWorld(OWNER_TEST_USER_ID, REAL_USER), (error: unknown) => error instanceof TestBoundaryError && (error as Error).message === TEST_BOUNDARY_ERROR);
    assert.throws(() => assertSameWorld(REAL_USER, FIXTURE_SELLER), TestBoundaryError);
  });
});

test('boundary classification is unchanged by role and status switches (the post-enable state)', async () => {
  await withEnv(stagingWithFixtures, () => {
    for (const role of ['agent', 'buyer', 'seller']) {
      for (const status of ['pending', 'under_review', 'verified', 'rejected', 'suspended']) {
        const switchedOwner = { ...owner, role, status };
        assert.equal(isOwnerTestPrincipal(switchedOwner), true, `owner ${role}/${status}`);
        assert.equal(isTestWorldId(switchedOwner.id), true);
        assert.equal(sameWorldIds(switchedOwner.id, FIXTURE_BUYER), true);
        assert.equal(sameWorldIds(switchedOwner.id, REAL_USER), false);
        assert.throws(() => assertSameWorld(switchedOwner.id, REAL_USER), TestBoundaryError);
      }
    }
    // A real account with the owner's phone is still not the owner principal (id AND phone required).
    assert.equal(isTestWorldId(REAL_USER), false);
    assert.equal(isTestPrincipal({ id: REAL_USER, phone: '+917994133604' }), false);
  });
});

test('testWorldPair: null for real pairs, false for mixed, true inside the test world', async () => {
  await withEnv(stagingWithFixtures, () => {
    assert.equal(testWorldPair(REAL_USER, REAL_USER_2), null);
    assert.equal(testWorldPair(OWNER_TEST_USER_ID, FIXTURE_BUYER), true);
    assert.equal(testWorldPair(FIXTURE_BUYER, FIXTURE_SELLER), true);
    assert.equal(testWorldPair(OWNER_TEST_USER_ID, REAL_USER), false);
    assert.equal(testWorldPair(REAL_USER, FIXTURE_SELLER), false);
    assert.equal(testWorldPair(FIXTURE_BUYER, REAL_USER), false);
  });
  await withEnv({ UDC_APP_ENV: 'production', UDC_TEST_FIXTURE_IDS: FIXTURE_BUYER }, () => {
    assert.equal(testWorldPair(FIXTURE_BUYER, FIXTURE_SELLER), null);
    assert.equal(testWorldPair(OWNER_TEST_USER_ID, FIXTURE_BUYER), null);
  });
});

test('testWorldCounterpartyRowsOk: verified documentless pairs pass, every weakening fails', async () => {
  await withEnv(stagingWithFixtures, () => {
    const ownerSeller = { ...owner, role: 'seller', status: 'verified' };
    const ownerBuyer = { ...owner, role: 'buyer', status: 'verified' };
    const fixtureBuyer = { id: FIXTURE_BUYER, role: 'buyer', status: 'verified', phone: null, email: 'test-buyer@udc-test.invalid' };
    const fixtureSeller = { id: FIXTURE_SELLER, role: 'seller', status: 'verified', phone: null, email: 'test-seller@udc-test.invalid' };

    // Owner as seller + fixture buyer, fixture pair, owner as buyer after a role switch: all pass.
    assert.equal(testWorldCounterpartyRowsOk([fixtureBuyer, ownerSeller], FIXTURE_BUYER, OWNER_TEST_USER_ID), true);
    assert.equal(testWorldCounterpartyRowsOk([fixtureBuyer, fixtureSeller], FIXTURE_BUYER, FIXTURE_SELLER), true);
    assert.equal(testWorldCounterpartyRowsOk([ownerBuyer, fixtureSeller], OWNER_TEST_USER_ID, FIXTURE_SELLER), true);

    // One side lost verified status (e.g. review downgrade): refused.
    assert.equal(testWorldCounterpartyRowsOk([{ ...fixtureBuyer, status: 'under_review' }, ownerSeller], FIXTURE_BUYER, OWNER_TEST_USER_ID), false);
    assert.equal(testWorldCounterpartyRowsOk([ownerSeller], FIXTURE_BUYER, OWNER_TEST_USER_ID), false);

    // Owner account phone changed: identity no longer the owner test principal, refused.
    assert.equal(testWorldCounterpartyRowsOk([fixtureBuyer, { ...ownerSeller, phone: '+919999999999' }], FIXTURE_BUYER, OWNER_TEST_USER_ID), false);

    // A registry id in the wrong seat (fixture id on a row that is not the fixture) fails role checks.
    assert.equal(testWorldCounterpartyRowsOk([{ ...fixtureBuyer, role: 'seller' }, ownerSeller], FIXTURE_BUYER, OWNER_TEST_USER_ID), false);
  });
});

test('OWNER_TEST_PHONE_DIGITS matches the owner principal phone digits', () => {
  assert.equal(OWNER_TEST_PHONE_DIGITS, '917994133604');
});

test("test world flag needs the pinned staging DB binding and ignores UDC_APP_ENV", async () => {
  const { isTestWorldEnabled, dbUrlTargetsTestWorld } = await import("../src/testPrincipal.ts");
  const good = { UDC_TEST_WORLD: "1", SUPABASE_URL: WORLD.SUPABASE_URL, SUPABASE_DATABASE_URL: WORLD.SUPABASE_DATABASE_URL };
  const e = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  assert.equal(isTestWorldEnabled(e({ ...good })), true);
  assert.equal(isTestWorldEnabled(e({ ...good, UDC_APP_ENV: "production" })), true, "does not depend on app env");
  assert.equal(isTestWorldEnabled(e({ UDC_APP_ENV: "staging" })), false, "staging app env alone enables nothing");
  assert.equal(isTestWorldEnabled(e({ ...good, UDC_TEST_WORLD: "true" })), false);
  assert.equal(isTestWorldEnabled(e({ ...good, UDC_TEST_WORLD: "" })), false);
  assert.equal(isTestWorldEnabled(e({ ...good, SUPABASE_DATABASE_URL: "postgres://postgres.otherproject:pw@h:6543/postgres" })), false, "other project fails closed");
  assert.equal(isTestWorldEnabled(e({ ...good, SUPABASE_DATABASE_URL: "postgres://postgres.prodref:lfqmfozvdaszpbbropqo@h:6543/postgres" })), false, "ref in the password does not count");
  assert.equal(isTestWorldEnabled(e({ ...good, SUPABASE_URL: "https://prodref.supabase.co" })), false, "mismatched API url fails closed");
  assert.equal(isTestWorldEnabled(e({ ...good, SUPABASE_DATABASE_URL: "not a url" })), false);
  assert.equal(dbUrlTargetsTestWorld("postgresql://postgres:pw@db.lfqmfozvdaszpbbropqo.supabase.co:5432/postgres"), true);
  assert.equal(dbUrlTargetsTestWorld(undefined), false);
});
