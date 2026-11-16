// Integration proof for the owner-test isolation boundary: the REAL entry-point modules
// (referral attribution, WhatsApp introductions, requirement notifications, commission
// proposals, verified-counterparty gate) run against an in-memory db fixture, with the
// real testPrincipal/testBoundary classification. Only the db layer, drizzle predicate
// builders and the WhatsApp client are mocked. No real sends, no real db.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const FIXTURE_BUYER = '11111111-1111-1111-1111-111111111111';
const FIXTURE_SELLER = '22222222-2222-2222-2222-222222222222';
const FIXTURE_AGENT = '55555555-5555-5555-5555-555555555555';
const REAL_AGENT = '66666666-6666-6666-6666-666666666666';
const REAL_SELLER = '77777777-7777-7777-7777-777777777777';
const REAL_BUYER = '88888888-8888-8888-8888-888888888888';
const OWNER = '30b6dc9b-8409-4b43-9b81-05e5f2869321';

const tableNames = ['usersTable','referralsTable','auditLogsTable','buyerRequestsTable','sellerListingsTable','productsTable','matchesTable','notificationsTable','dealsTable','commissionsTable','dealParticipantsTable','companiesTable','companyVerificationDocumentsTable'];

let mod: any;
let rows: Record<string, any[]>;
let sent: any[];
let db: any;
let output = '';

function makeDb() {
  const tables: any = Object.fromEntries(tableNames.map((name) => [name, new Proxy({ _tableName: name }, {
    get(target, key) { return key === '_tableName' ? (target as any)._tableName : { kind: 'column', table: name, key }; },
  })]));
  const evaluate = (node: any, row: any): any => {
    if (node?.kind === 'column') return row[node.table]?.[node.key];
    if (node?.kind === 'eq') return evaluate(node.a, row) === evaluate(node.b, row);
    if (node?.kind === 'ne') return evaluate(node.a, row) !== evaluate(node.b, row);
    if (node?.kind === 'and') return node.args.every((n: any) => evaluate(n, row));
    if (node?.kind === 'or') return node.args.some((n: any) => evaluate(n, row));
    if (node?.kind === 'in' && Array.isArray(node.query)) return node.query.includes(evaluate(node.a, row));
    return node; // sql`` fragments return true from the mock; literals return themselves
  };
  function select(fields?: any) {
    let table = '', condition: any = true, maximum = Infinity;
    const q: any = {
      from(t: any) { table = t._tableName; return q; },
      where(c: any) { condition = c; return q; },
      orderBy() { return q; }, for() { return q; }, limit(n: number) { maximum = n; return q; },
      innerJoin() { return q; },
      run() {
        return rows[table].filter((r) => evaluate(condition, { [table]: r })).slice(0, maximum)
          .map((r) => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, evaluate(v, { [table]: r })])) : { ...r });
      },
      then(resolve: any, reject: any) { return Promise.resolve().then(q.run).then(resolve, reject); },
    };
    return q;
  }
  function insert(table: any) {
    let input: any;
    const run = () => {
      const records = (Array.isArray(input) ? input : [input]).map((item) => ({ id: randomUUID(), createdAt: new Date(), ...item }));
      rows[table._tableName].push(...records);
      return records;
    };
    const q: any = {
      values(v: any) { input = v; return q; },
      onConflictDoNothing() { return q; }, onConflictDoUpdate() { return q; },
      returning(fields?: any) { return Promise.resolve(run().map((r) => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, r[v.key]])) : r)); },
      then(resolve: any, reject: any) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return q;
  }
  const database: any = { select, insert, tables };
  database.execute = async () => ({ rows: [] });
  database.transaction = async (cb: any) => cb(database);
  return database;
}

before(async () => {
  db = makeDb();
  (globalThis as any).__boundary = { db, get sent() { return sent; } };
  output = fileURLToPath(new URL(`./boundary-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: {
      contents: [
        'export { handleJoinMessage, claimInviteAfterRegistration } from "../src/referrals/joinService.ts";',
        'export { handleWhatsAppIntroduction } from "../src/referrals/whatsappIntroduction.ts";',
        'export { notifyMatchingSellers, respondToRequirementInterest, openRequirementsReplyForSeller } from "../src/marketplace/sellerRequirementNotify.ts";',
        'export { prepareCommissionProposals, approveCommissionProposal, ProposalError } from "../src/referrals/commissionProposal.ts";',
        'export { verifiedCounterparties } from "../src/marketplace/verifiedCounterparties.ts";',
      ].join('\n'),
      resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{ name: 'fixtures', setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === '@workspace/db') return { path: 'db', namespace: 'fixture' };
        if (args.path === 'drizzle-orm') return { path: 'orm', namespace: 'fixture' };
        if (args.path === '../whatsapp/client' || args.path === '../whatsapp/client.ts') return { path: 'client', namespace: 'fixture' };
      });
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'js', contents:
        'const s=globalThis.__boundary;' + (args.path === 'db'
          ? 'export const db=s.db;' + tableNames.map((n) => `export const ${n}=s.db.tables.${n};`).join('')
          : args.path === 'orm'
            ? 'export const eq=(a,b)=>({kind:"eq",a,b});export const ne=(a,b)=>({kind:"ne",a,b});export const and=(...args)=>({kind:"and",args});export const or=(...args)=>({kind:"or",args});export const inArray=(a,query)=>({kind:"in",a,query});export const sql=()=>true;export const desc=x=>x;export const gte=(a,b)=>({kind:"gte",a,b});export const lt=(a,b)=>({kind:"lt",a,b});'
            : 'export const sendWhatsAppText=async(to,body)=>{s.sent.push({kind:"text",to,body});return {delivered:true,messageId:"m-1"};};export const sendWhatsAppInteractive=async(to,body)=>{s.sent.push({kind:"interactive",to,body});return {delivered:true,messageId:"m-2"};};') }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  process.env.UDC_APP_ENV = 'staging';
  process.env.UDC_TEST_FIXTURE_IDS = [FIXTURE_BUYER, FIXTURE_SELLER, FIXTURE_AGENT].join(',');
  mod = await import(output);
});

function reset() {
  for (const name of tableNames) rows[name].length = 0;
  sent.length = 0;
}
rows = Object.fromEntries(tableNames.map((n) => [n, []]));
sent = [];

after(() => { if (output) void unlink(output).catch(() => {}); });

test('joinService.handleJoinMessage: test-world agent cannot attribute a real user, and reverse', async () => {
  reset();
  rows.usersTable.push(
    { id: FIXTURE_AGENT, role: 'agent', status: 'verified', fullName: 'Fixture Agent', phone: null },
    { id: REAL_BUYER, role: 'buyer', status: 'verified', phone: '+911000000001' },
  );
  const code = `JOIN UDC-${FIXTURE_AGENT.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const reply1 = await mod.handleJoinMessage('+911000000001', code);
  assert.equal(reply1, 'An introduction is already recorded for your account. Ask UDC to review any correction.');
  assert.equal(rows.referralsTable.length, 0, 'no referral row may be created across the boundary');

  reset();
  rows.usersTable.push(
    { id: REAL_AGENT, role: 'agent', status: 'verified', fullName: 'Real Agent', phone: '+911000000009' },
    { id: OWNER, role: 'buyer', status: 'verified', phone: '+917994133604' },
  );
  const code2 = `JOIN UDC-${REAL_AGENT.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const reply2 = await mod.handleJoinMessage('+917994133604', code2);
  assert.equal(reply2, 'An introduction is already recorded for your account. Ask UDC to review any correction.');
  assert.equal(rows.referralsTable.length, 0, 'real agent must not attribute the owner test account');

  reset(); // control: same-world attribution still works
  rows.usersTable.push(
    { id: FIXTURE_AGENT, role: 'agent', status: 'verified', fullName: 'Fixture Agent', phone: null },
    { id: FIXTURE_BUYER, role: 'buyer', status: 'verified', phone: '+911000000002' },
  );
  const reply4 = await mod.handleJoinMessage('+911000000002', code);
  assert.match(String(reply4), /introduction is recorded/);
  assert.equal(rows.referralsTable.length, 1, 'same-world attribution must still work');
});

test('handleWhatsAppIntroduction: cross-world code request and accept are refused', async () => {
  reset();
  rows.usersTable.push(
    { id: FIXTURE_AGENT, role: 'agent', status: 'verified', fullName: 'Fixture Agent' },
    { id: REAL_BUYER, role: 'buyer', status: 'verified', phone: '+911000000003' },
  );
  const handled = await mod.handleWhatsAppIntroduction('+911000000003', { text: { body: `referral UDC-${FIXTURE_AGENT}` } });
  assert.equal(handled, true);
  assert.match(sent.at(-1).body, /unavailable/);
  assert.equal(rows.auditLogsTable.filter((r) => r.action === 'whatsapp_referral_requested').length, 0);

  reset(); // accept path: planted request from owner (test world) naming a real agent
  rows.usersTable.push(
    { id: REAL_AGENT, role: 'agent', status: 'verified', fullName: 'Real Agent' },
    { id: OWNER, role: 'seller', status: 'verified', phone: '+917994133604' },
  );
  const requestId = randomUUID();
  rows.auditLogsTable.push({ id: requestId, actorUserId: OWNER, action: 'whatsapp_referral_requested', entityType: 'user', entityId: OWNER,
    metadata: { agentUserId: REAL_AGENT, expiresAt: new Date(Date.now() + 3600_000).toISOString() } });
  const done = await mod.handleWhatsAppIntroduction('+917994133604', { interactive: { button_reply: { id: `udc:referral:accept:${requestId}` } } });
  assert.equal(done, true);
  assert.match(sent.at(-1).body, /needs UDC review/);
  assert.equal(rows.referralsTable.length, 0, 'cross-world accept must not create a referral');
});

test('notifyMatchingSellers: test requests never reach real sellers, real requests never reach fixtures', async () => {
  reset();
  rows.productsTable.push({ id: 'prod-1', name: 'Copper' });
  rows.buyerRequestsTable.push({ id: 'req-test', buyerUserId: FIXTURE_BUYER, productId: 'prod-1', status: 'approved', quantity: '10', unit: 'MT' });
  rows.sellerListingsTable.push({ id: 'list-real', sellerUserId: REAL_SELLER, productId: 'prod-1', status: 'approved' });
  rows.usersTable.push({ id: REAL_SELLER, phone: '+911000000004', status: 'verified', role: 'seller' });
  const sentCount1 = await mod.notifyMatchingSellers('req-test');
  assert.equal(sentCount1, 0);
  assert.equal(sent.length, 0, 'no WhatsApp notification to a real seller from a test requirement');
  assert.equal(rows.auditLogsTable.length, 0);

  reset(); // reverse direction
  rows.productsTable.push({ id: 'prod-1', name: 'Copper' });
  rows.buyerRequestsTable.push({ id: 'req-real', buyerUserId: REAL_BUYER, productId: 'prod-1', status: 'approved', quantity: '10', unit: 'MT' });
  rows.sellerListingsTable.push({ id: 'list-fixture', sellerUserId: FIXTURE_SELLER, productId: 'prod-1', status: 'approved' });
  rows.usersTable.push({ id: FIXTURE_SELLER, phone: '+911000000005', status: 'verified', role: 'seller' });
  const sentCount2 = await mod.notifyMatchingSellers('req-real');
  assert.equal(sentCount2, 0);
  assert.equal(sent.length, 0, 'no notification to a fixture from a real requirement');

  reset(); // control: inside the test world it still notifies
  rows.productsTable.push({ id: 'prod-1', name: 'Copper' });
  rows.buyerRequestsTable.push({ id: 'req-test-2', buyerUserId: FIXTURE_BUYER, productId: 'prod-1', status: 'approved', quantity: '10', unit: 'MT' });
  rows.sellerListingsTable.push({ id: 'list-fixture-2', sellerUserId: FIXTURE_SELLER, productId: 'prod-1', status: 'approved' });
  rows.usersTable.push({ id: FIXTURE_SELLER, phone: '+911000000005', status: 'verified', role: 'seller' });
  const sentCount3 = await mod.notifyMatchingSellers('req-test-2');
  assert.equal(sentCount3, 1);
  assert.equal(sent.length, 1, 'same-world notification must still work');
});

test('respondToRequirementInterest: cross-world interest is unavailable, same-world creates the match', async () => {
  reset(); // real seller interested in a test-world requirement
  rows.usersTable.push({ id: REAL_SELLER, role: 'seller', phone: '+911000000006', status: 'verified' });
  rows.buyerRequestsTable.push({ id: 'req-x', buyerUserId: FIXTURE_BUYER, productId: 'prod-1', status: 'approved' });
  rows.sellerListingsTable.push({ id: 'list-x', sellerUserId: REAL_SELLER, productId: 'prod-1', status: 'approved' });
  await mod.respondToRequirementInterest('+911000000006', 'req-x', true);
  assert.match(sent.at(-1).body, /unavailable|not available|no longer/i);
  assert.equal(rows.matchesTable.length, 0, 'cross-world interest must not create a match');

  reset(); // same-world control
  rows.usersTable.push({ id: FIXTURE_SELLER, role: 'seller', phone: '+911000000007', status: 'verified' });
  rows.buyerRequestsTable.push({ id: 'req-y', buyerUserId: FIXTURE_BUYER, productId: 'prod-1', status: 'approved' });
  rows.sellerListingsTable.push({ id: 'list-y', sellerUserId: FIXTURE_SELLER, productId: 'prod-1', status: 'approved' });
  await mod.respondToRequirementInterest('+911000000007', 'req-y', true);
  assert.equal(rows.matchesTable.length, 1, 'same-world interest must still create a match');
});

test('openRequirementsReplyForSeller: real sellers never see test-world requirements', async () => {
  reset();
  rows.usersTable.push({ id: REAL_SELLER, role: 'seller', phone: '+911000000008', status: 'verified' });
  rows.sellerListingsTable.push({ id: 'list-z', sellerUserId: REAL_SELLER, productId: 'prod-1', status: 'approved' });
  rows.buyerRequestsTable.push({ id: 'req-t', buyerUserId: FIXTURE_BUYER, productId: 'prod-1', status: 'approved' });
  const onlyTest = await mod.openRequirementsReplyForSeller('+911000000008');
  rows.buyerRequestsTable.push({ id: 'req-r', buyerUserId: REAL_BUYER, productId: 'prod-1', status: 'approved' });
  const oneRealOneTest = await mod.openRequirementsReplyForSeller('+911000000008');
  rows.buyerRequestsTable.push({ id: 'req-r2', buyerUserId: REAL_BUYER, productId: 'prod-1', status: 'approved' });
  const twoRealOneTest = await mod.openRequirementsReplyForSeller('+911000000008');
  assert.notEqual(onlyTest, oneRealOneTest, 'adding a real request must change the reply');
  assert.notEqual(oneRealOneTest, twoRealOneTest, 'adding a second real request must change the reply');
  // The test-world request was present in all three replies; only the real count moved.
});

test('commission proposals: cross-world beneficiaries skipped at prepare, blocked at approve', async () => {
  reset();
  rows.dealsTable.push({ id: 'deal-t', dealNumber: 'D1', buyerUserId: FIXTURE_BUYER, sellerUserId: FIXTURE_SELLER, status: 'completed', quantity: '10', unit: 'MT', agreedPrice: '100', currency: 'USD' });
  rows.auditLogsTable.push({ id: 'terms-1', entityType: 'deal', entityId: 'deal-t', action: 'commission_terms_agreed',
    metadata: { beneficiaryUserId: REAL_AGENT, method: 'fixed_amount', amount: 50, currency: 'USD' } });
  const proposals = await mod.prepareCommissionProposals(db, 'deal-t');
  assert.equal(proposals.length, 0, 'a test-world deal must not spawn proposals for a real beneficiary');
  assert.equal(rows.auditLogsTable.filter((r) => r.action === 'commission_proposal_prepared').length, 0);

  reset(); // control: same-world beneficiary still gets a proposal
  rows.dealsTable.push({ id: 'deal-t2', dealNumber: 'D2', buyerUserId: FIXTURE_BUYER, sellerUserId: FIXTURE_SELLER, status: 'completed', quantity: '10', unit: 'MT', agreedPrice: '100', currency: 'USD' });
  rows.auditLogsTable.push({ id: 'terms-2', entityType: 'deal', entityId: 'deal-t2', action: 'commission_terms_agreed',
    metadata: { beneficiaryUserId: FIXTURE_AGENT, method: 'fixed_amount', amount: 50, currency: 'USD' } });
  const proposals2 = await mod.prepareCommissionProposals(db, 'deal-t2');
  assert.equal(proposals2.length, 1, 'same-world proposal must still be prepared');

  reset(); // approve path: real deal + test-world beneficiary
  rows.dealsTable.push({ id: 'deal-real', dealNumber: 'D3', buyerUserId: REAL_BUYER, sellerUserId: REAL_SELLER, status: 'completed', quantity: '10', unit: 'MT', agreedPrice: '100', currency: 'USD' });
  rows.auditLogsTable.push({ id: 'prop-1', action: 'commission_proposal_prepared', entityType: 'commission_proposal', entityId: 'terms-3',
    metadata: { dealId: 'deal-real', termsRecordId: 'terms-3', beneficiaryUserId: FIXTURE_AGENT, method: 'fixed_amount', rate: null, amount: 50, currency: 'USD', quantity: '10', unit: 'MT', agreedPrice: '100' } });
  await assert.rejects(() => mod.approveCommissionProposal('prop-1', 'admin-1'), /test_boundary_crossing/);
  assert.equal(rows.commissionsTable.length, 0, 'no commission row may be written across the boundary');
});

test('verifiedCounterparties (real module): mixed pair fails closed, test pair trades documentless', async () => {
  reset();
  rows.usersTable.push(
    { id: OWNER, role: 'seller', status: 'verified', phone: '+917994133604' },
    { id: FIXTURE_BUYER, role: 'buyer', status: 'verified', phone: null },
    { id: REAL_SELLER, role: 'seller', status: 'verified', phone: '+911000000010' },
  );
  assert.equal(await mod.verifiedCounterparties(FIXTURE_BUYER, OWNER, db), true, 'documentless test-world pair must pass');
  assert.equal(await mod.verifiedCounterparties(OWNER, REAL_SELLER, db), false, 'mixed pair must fail closed');
  assert.equal(await mod.verifiedCounterparties(FIXTURE_BUYER, REAL_SELLER, db), false, 'mixed pair must fail closed');
  reset(); // outside staging every id is ordinary: same rows, no evidence -> false
  const savedEnv = process.env.UDC_APP_ENV;
  process.env.UDC_APP_ENV = 'production';
  rows.usersTable.push(
    { id: FIXTURE_BUYER, role: 'buyer', status: 'verified' },
    { id: FIXTURE_SELLER, role: 'seller', status: 'verified' },
  );
  assert.equal(await mod.verifiedCounterparties(FIXTURE_BUYER, FIXTURE_SELLER, db), false, 'outside staging the test world does not exist');
  process.env.UDC_APP_ENV = savedEnv;
});
