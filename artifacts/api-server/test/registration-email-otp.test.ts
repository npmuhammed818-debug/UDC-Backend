import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Owner rule (10 Nov): once a customer gives an email in chat registration, a
// 6-digit OTP goes to that email immediately, the code is collected in chat,
// and registration is confirmed only after it verifies. Synthetic fixtures;
// emailAuth is stubbed at the module seam so no real email or DB is touched.

const TABLE_NAMES = ['buyerPoolsTable','buyerPoolAllocationsTable','auditLogsTable','companiesTable','companyVerificationDocumentsTable','commissionsTable','dealFinancialsTable','dealParticipantsTable','dealsTable','notificationsTable','referralsTable','usersTable','whatsappUserContextsTable','buyerRequestsTable','sellerListingsTable','productsTable','whatsappChatSessionsTable','akifCustomerMemoriesTable','akifEmotionalStatesTable','matchesTable','shipmentsTable','shipmentTrackingEventsTable','shipmentCargoUnitsTable','shipmentWatchesTable','whatsappVoicePreferencesTable','dealMeetingsTable'];

async function makeBundle(globalName: string, stdinContents: string, opts: { knownEmail?: string | null } = {}) {
  const tables: any = Object.fromEntries(TABLE_NAMES.map(n => [n, new Proxy({ _table: n }, { get: (_, k) => k === '_table' ? n : { column: k, table: n } })]));
  const rows: any = Object.fromEntries(TABLE_NAMES.map(n => [n, []]));
  const value = (x: any, r: any): any => x?.column ? (r[x.table] ?? r)[x.column] : x;
  const match = (c: any, r: any): any => !c ? true
    : c.kind === 'eq' ? value(c.a, r) === value(c.b, r)
    : c.kind === 'lt' ? value(c.a, r) < value(c.b, r)
    : c.kind === 'and' ? c.args.every((x: any) => match(x, r))
    : c.kind === 'or' ? c.args.some((x: any) => match(x, r))
    : c.kind === 'sql' ? (c.parts.join('').includes('lower(') ? String((r.usersTable ?? r).email ?? '').toLowerCase() === c.values.at(-1) : true)
    : true;
  const state: any = { tables, rows, sent: [], emailCalls: [], knownEmail: opts.knownEmail ?? null };
  function select(fields?: any) { let table: any, c: any, limit = Infinity; const q: any = { from: (v: any) => { table = v._table; return q; }, where: (v: any) => { c = v; return q; }, limit: (n: number) => { limit = n; return q; }, orderBy: () => q, innerJoin: () => q, then: (resolve: any, reject: any) => Promise.resolve().then(() => rows[table].filter((r: any) => match(c, r)).slice(0, limit).map((r: any) => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, value(v, r)])) : { ...r })).then(resolve, reject) }; return q; }
  function mutation(table: any, update = false, remove = false) { let input: any, c: any, done: any, conflict: any; const run = () => { if (done) return done;
    if (remove) { done = rows[table._table].filter((r: any) => match(c, r)); rows[table._table] = rows[table._table].filter((r: any) => !match(c, r)); }
    else if (update) { done = rows[table._table].filter((r: any) => match(c, r)); done.forEach((r: any) => Object.assign(r, input)); }
    else if (conflict) { const column = conflict.target.column; const old = rows[table._table].find((r: any) => r[column] === input[column]); if (old) { Object.assign(old, conflict.set); done = [old]; } }
    if (!done) { done = (Array.isArray(input) ? input : [input]).map((r: any) => ({ id: randomUUID(), status: 'pending', ...r })); rows[table._table].push(...done); } return done; };
    const q: any = { values: (v: any) => { input = v; return q; }, set: (v: any) => { input = v; return q; }, where: (v: any) => { c = v; return q; }, onConflictDoUpdate: (v: any) => { conflict = v; return q; }, returning: (fields?: any) => { const result = run(); return Promise.resolve(fields ? result.map((r: any) => Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, r[v.column]]))) : result); }, then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject) }; return q; }
  state.db = { select, insert: (t: any) => mutation(t), update: (t: any) => mutation(t, true), delete: (t: any) => mutation(t, false, true),
    execute: async (v: any) => { const text = (v?.parts ?? []).join(' ');
      if (text.includes('from users where phone')) { const phone = (v.values ?? []).find((x: any) => rows.usersTable.some((u: any) => u.phone === x)); return { rows: rows.usersTable.filter((u: any) => u.phone === phone).map((u: any) => ({ id: u.id, email: u.email ?? null, status: u.status, role: u.role })) }; }
      if (text.includes('order by created_at desc')) return { rows: state.pendingChallengeId ? [{ id: state.pendingChallengeId }] : [] };
      return { rows: [] }; } };
  let queue = Promise.resolve(); state.db.transaction = (f: any) => { const before = structuredClone(rows); const job = queue.then(async () => { try { return await f(state.db); } catch (e) { for (const n of TABLE_NAMES) rows[n] = before[n]; throw e; } }); queue = job.catch(() => {}); return job; };
  (globalThis as any)[globalName] = state;
  const G = globalName;
  const fixtures: Record<string, string> = {
    hermes: "export const isAkifBrainConfigured=()=>false;export const runConversationChat=async()=>({content:'{}'});",
    db: `const s=globalThis.${G};export const db=s.db;` + TABLE_NAMES.map(n => `export const ${n}=s.tables.${n};`).join(''),
    orm: "export const inArray=(a,list)=>({kind:'in',a,list});export const ilike=(a,b)=>({kind:'ilike',a,b});export const lt=(a,b)=>({kind:'lt',a,b});export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const desc=x=>x;export const asc=x=>x;export const gt=(a,b)=>({kind:'gt',a,b});export const isNull=(a)=>({kind:'isnull',a});export const sql=(parts,...values)=>({kind:'sql',parts,values});",
    client: "export const isWindowClosedError=()=>false;export const sendWhatsAppText=async(to,body)=>({delivered:true,messageId:'out-1'});export const sendWhatsAppTextWithMenu=async(to,body)=>({delivered:true,messageId:'out-2'});export const sendWhatsAppInteractive=async()=>({delivered:true,messageId:'ui-1'});export const downloadWhatsAppMedia=async()=>({bytes:Buffer.from('x'),mimeType:'application/pdf'});export const markReadAndTyping=()=>{};export const markRead=()=>{};export const sendWhatsAppReaction=async()=>({delivered:true,messageId:'rx-1'});export const sendWhatsAppVoiceNote=async()=>({delivered:true,messageId:'vn-1'});export const trackReplyFailures=(fn)=>fn(new Set());",
    storage: "export const uploadDocumentBytes=async(path)=>'storage://private/'+path;",
    worker: "export const synthesizeAkifSpeechTimed=async()=>({bytes:Buffer.from('a'),seconds:1});",
    setup: "export const publishedFlowId=async()=>'123456';",
    password: "export const hashPassword=async()=>'synthetic-unusable-hash';",
    sellerNotify: "export const asksForOpenRequirements=()=>false;export const openRequirementsReplyForSeller=async()=>null;export const respondToRequirementInterest=async()=>{};",
    roleChange: "export const requestRoleChange=async()=>({status:'pending'});export const roleChangeReply=(status,role)=>'Request saved for '+role+'.';",
    emailAuth: `const s=globalThis.${G};export const emailAuth={status:async(userId)=>{s.emailCalls.push(['status',userId]);return {emailVerified:false};},requestVerification:async(userId)=>{s.emailCalls.push(['requestVerification',userId]);s.pendingChallengeId='ch-1';return {challengeId:'ch-1',expiresInSeconds:600};},verify:async(userId,id,code)=>{s.emailCalls.push(['verify',userId,id,code]);return true;},ipBudget:async()=>{}};export class EmailAuthError extends Error{constructor(kind){super(kind);this.kind=kind;}}`,
    adminAlerts: "export const queueAdminReviewAlert=()=>{};",
    tester: "export const isTesterPhone=()=>false;",
    humanRelay: `const s=globalThis.${G};export const knownFactsForContact=()=>({name:'Synthetic Agent',email:s.knownEmail});`,
  };
  const output = fileURLToPath(new URL(`./otp-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({ stdin: { contents: stdinContents, resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false, plugins: [{ name: 'otp-fixture', setup(b) {
    const map: Array<[RegExp, string]> = [
      [/intelligence\/workerClient$/, 'worker'],
      [/marketplace\/sellerRequirementNotify$/, 'sellerNotify'],
      [/intelligence\/hermesClient(\.ts)?$/, 'hermes'],
      [/^@workspace\/db$/, 'db'],
      [/^drizzle-orm$/, 'orm'],
      [/whatsapp\/client$|^\.\/client$/, 'client'],
      [/supabase\/storage$/, 'storage'],
      [/^\.\/setupFlows$/, 'setup'],
      [/auth\/passwords$/, 'password'],
      [/accounts\/roleChangeRequest$/, 'roleChange'],
      [/auth\/emailAuth$/, 'emailAuth'],
      [/whatsapp\/adminReviewAlerts$|\.\.\/whatsapp\/adminReviewAlerts$/, 'adminAlerts'],
      [/auth\/testerMode$/, 'tester'],
      [/akif\/humanRelay$|\.\/humanRelay$/, 'humanRelay'],
    ];
    for (const [filter, path] of map) b.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      if (!(args.path in fixtures)) throw new Error('unstubbed module: ' + args.path);
      return { contents: fixtures[args.path] };
    });
  } }] });
  await writeFile(output, bundle.outputFiles[0].text);
  return { state, output };
}

test('quick agent registration asks for the OTP before confirming, and only Sandra\'s existing account is exempt', async () => {
  const { state, output } = await makeBundle('__otpAgent', "export { registerWhatsAppAgent } from '../src/akif/agentRegistration';", { knownEmail: 'agent@example.invalid' });
  try {
    const m = await import(output);
    const reply = await m.registerWhatsAppAgent('10000000010', 'Synthetic Agent');
    assert.match(reply, /6-digit code/);
    assert.match(reply, /finish your registration/);
    assert.doesNotMatch(reply, /pending UDC review\. Agent deal access/);
    assert.deepEqual(state.emailCalls.filter((c: any) => c[0] === 'requestVerification').length, 1);
    assert.equal(rows_agent(state).length, 1);

    // Second call: the account exists with an unverified email. Owner rule
    // (10 Nov): OTP for everyone except Sandra, so a fresh code goes out.
    state.emailCalls.length = 0;
    const again = await m.registerWhatsAppAgent('10000000010', 'Synthetic Agent');
    assert.match(again, /6-digit code/);
    assert.equal(state.emailCalls.filter((c: any) => c[0] === 'requestVerification').length, 1);

    // Sandra's existing account is the single exemption: no code, status reply.
    state.emailCalls.length = 0;
    state.rows.usersTable.push({ id: 'u-sandra', phone: '917028815509', email: 'trinitysandra2512@gmail.com', status: 'verified', role: 'agent' });
    const sandra = await m.registerWhatsAppAgent('917028815509', 'Sandra Victor');
    assert.match(sandra, /already approved/);
    assert.doesNotMatch(sandra, /6-digit code/);
    assert.equal(state.emailCalls.filter((c: any) => c[0] === 'requestVerification').length, 0);

    // No email collected: registration saves with the classic reply, no code.
    state.knownEmail = null;
    const plain = await m.registerWhatsAppAgent('10000000011');
    assert.match(plain, /pending UDC review/);
    assert.doesNotMatch(plain, /6-digit code/);
  } finally { await unlink(output); }
  function rows_agent(s: any) { return s.rows.usersTable; }
});

test('menu form registration asks for the OTP first instead of declaring registration saved', async () => {
  const { state, output } = await makeBundle('__otpForm', "export * from '../src/whatsapp/chatUi';export * from '../src/whatsapp/flowToken';");
  const previous = process.env.WHATSAPP_APP_SECRET; process.env.WHATSAPP_APP_SECRET = 'synthetic-chat-ui-secret-at-least-32';
  try {
    const m = await import(output);
    const phone = '10000000012';
    const reply = await m.submitChatFlow(phone, JSON.stringify({ flow_token: m.issueFlowToken(phone, 'profile_agent'), full_name: 'Synthetic Agent', email: 'agent@gmail.com' }));
    assert.match(reply, /6-digit code/);
    assert.match(reply, /finish your registration/);
    assert.doesNotMatch(reply, /saved for UDC review/);
    assert.equal(state.emailCalls.filter((c: any) => c[0] === 'requestVerification').length, 1);
    assert.equal(state.rows.usersTable.length, 1);
    assert.equal(state.rows.usersTable[0].status, 'pending');
  } finally { await unlink(output); if (previous === undefined) delete process.env.WHATSAPP_APP_SECRET; else process.env.WHATSAPP_APP_SECRET = previous; }
});

test('verifying the code confirms a pending registration in chat', async () => {
  const { state, output } = await makeBundle('__otpVerify', "export { handleEmailVerification } from '../src/whatsapp/emailVerification';");
  try {
    const m = await import(output);
    state.rows.usersTable.push({ id: 'u-agent', phone: '10000000013', email: 'agent@example.invalid', status: 'pending', role: 'agent' });
    state.pendingChallengeId = 'ch-1';
    const agentReply = await m.handleEmailVerification('10000000013', 'email code 123456');
    assert.match(agentReply, /agent registration is now saved for UDC review/);
    assert.deepEqual(state.emailCalls.find((c: any) => c[0] === 'verify').slice(1), ['u-agent', 'ch-1', '123456']);

    state.rows.usersTable.push({ id: 'u-buyer', phone: '10000000014', email: 'buyer@example.invalid', status: 'pending', role: 'buyer' });
    const buyerReply = await m.handleEmailVerification('10000000014', 'email code 654321');
    assert.match(buyerReply, /registration is now saved for UDC review/);
    assert.match(buyerReply, /Documents/);

    state.rows.usersTable.push({ id: 'u-old', phone: '10000000015', email: 'old@example.invalid', status: 'verified', role: 'buyer' });
    const oldReply = await m.handleEmailVerification('10000000015', 'email code 111111');
    assert.equal(oldReply, 'Your email ownership is verified. Company approval is a separate UDC review.');
  } finally { await unlink(output); }
});
