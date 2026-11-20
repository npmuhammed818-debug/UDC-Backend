process.env.WHATSAPP_INBOUND_PER_MINUTE = "100000"; // these fixtures reuse one phone; the cap has its own test
import { test } from "node:test";
import { noteExternalSend, brainTurnHadExternalSend, resetExternalSendsForTest } from "../src/akif/relayOutcome.ts";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// HISTORICAL BASELINE - do not delete, do not unskip.
// Encodes the reproduced pre-repair defect (commit 4b722d7c against c427372):
// under a 25006-poisoned pooled session the gate's raw-db mark and the raw-db
// completion write failed silently behind a 200 ack, losing the one-time
// holding reply and leaving a permanent uncompleted claim. These assertions
// describe the DEFECT, so they fail by design against the repaired code
// (c22defb6: mark/completion/release routed through dbWrite). The repair
// verification lives in whatsapp-freeze-gate-repair.test.ts.
// Exercise the real signed webhook, including route ordering and DB predicates.
// All identities, models, media, storage and provider calls are isolated fixtures.
test("WhatsApp webhook intake and private media acceptance", { skip: "historical defect baseline: passes only against pre-repair code (c427372); see header" }, async (t) => {
  const names = ["buyerPoolAllocationsTable","buyerPoolsTable","matchesTable","referralsTable","commissionsTable","notificationPreferencesTable","sellerListingsTable","companyVerificationDocumentsTable","messagesTable","notificationsTable", "auditLogsTable", "productsTable", "dealConversationEventsTable", "dealParticipantsTable", "dealsTable",
    "documentAccessTable", "documentExtractionsTable", "documentsTable", "usersTable", "buyerRequestsTable", "whatsappMessageContextsTable", "whatsappUserContextsTable", "companiesTable", "akifSharedLessonsTable", "dealMeetingsTable", "dealFinancialsTable", "whatsappInboundDedupTable", "whatsappWebhookReceiptsTable"];
  const tables: any = Object.fromEntries(names.map(name => [name, new Proxy({ _tableName: name }, {
    get(target, key) { return key === "_tableName" ? target._tableName : { kind: "column", table: name, key }; },
  })]));
  const rows: Record<string, any[]> = Object.fromEntries(names.map(name => [name, []]));
  const evaluate = (node: any, row: any): any => {
    if (node?.kind === "column") return row[node.table]?.[node.key];
    if (node?.kind === "eq") return evaluate(node.a, row) === evaluate(node.b, row);
    if (node?.kind === "ne") return evaluate(node.a, row) !== evaluate(node.b, row);
    if (node?.kind === "and") return node.args.every((n: any) => evaluate(n, row));
    if (node?.kind === "or") return node.args.some((n: any) => evaluate(n, row));
    if (node?.kind === "in" && Array.isArray(node.query)) return node.query.includes(evaluate(node.a, row));
    if (node?.kind === "in") return node.query.run().some((r: any) => Object.values(r)[0] === evaluate(node.a, row));
    if (node?.kind === "notIn" && Array.isArray(node.query)) return !node.query.includes(evaluate(node.a, row));
    return node;
  };
  function select(fields?: any) {
    let table: string, condition: any = true, maximum = Infinity;
    const joins: any[] = [];
    const q: any = {
      from(t: any) { table = t._tableName; return q; }, where(c: any) { condition = c; return q; },
      innerJoin(t: any, on: any) { joins.push({ table: t._tableName, on }); return q; },
      orderBy() { return q; }, for() { return q; }, limit(n: number) { maximum = n; return q; },
      run() {
        let values = rows[table].map(r => ({ [table]: r }));
        for (const join of joins) values = values.flatMap(r => rows[join.table]
          .map(v => ({ ...r, [join.table]: v })).filter(r => evaluate(join.on, r)));
        return values.filter(r => evaluate(condition, r)).slice(0, maximum).map(r => fields
          ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, evaluate(v, r)])) : { ...r[table] });
      }, then(resolve: any, reject: any) { return Promise.resolve().then(q.run).then(resolve, reject); },
    };
    return q;
  }
  function insert(table: any, poisonAware = true) {
    let input: any, ignoreConflict = false, inserted: any[] | undefined;
    const run = () => {
      if (poisonAware && state.poison) throw Object.assign(new Error('fixture read-only transaction'), { code: '25006' });
      if (inserted) return inserted;
      if (ignoreConflict && rows[table._tableName].some(r => r.providerMessageId === input.providerMessageId && input.providerMessageId)) return inserted = [];
      const records = (Array.isArray(input) ? input : [input]).map(item => ({ id: randomUUID(),createdAt:new Date(), ...item }));
      rows[table._tableName].push(...records);
      return inserted = records;
    };
    const q: any = { values(v: any) { input = v; return q; },
      onConflictDoNothing() { ignoreConflict = true; return q; }, onConflictDoUpdate() { return q; },
      returning(fields?: any) { return Promise.resolve(run().map(r => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, r[v.key]])) : r)); },
      then(resolve: any, reject: any) { return Promise.resolve().then(run).then(resolve, reject); } };
    return q;
  }
  function update(table:any,poisonAware=true){let input:any,condition:any;const run=()=>{if(poisonAware&&state.poison)throw Object.assign(new Error('fixture read-only transaction'),{code:'25006'});const values=rows[table._tableName].filter(r=>evaluate(condition,{[table._tableName]:r}));values.forEach(r=>Object.assign(r,input));return values;};const q:any={set(v:any){input=v;return q;},where(v:any){condition=v;return q;},returning:async()=>run(),then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};return q;}
  const del = (table:any,poisonAware=true)=>({ where: async (c:any) => { if(poisonAware&&state.poison)throw Object.assign(new Error('fixture read-only transaction'),{code:'25006'}); return []; } });
  const state: any = { tables, db: { select, insert,update, delete: del }, cleanDb: { select, insert:(t:any)=>insert(t,false), update:(t:any)=>update(t,false), delete:(t:any)=>del(t,false) }, sent: [], signed: [], uploaded: [], intake: [], recorded: [],
    privacyReply: null, saved: null, decision: null, dealDecision: null, dealCalls: 0,
    send: async (to: string, body: any) => { state.sent.push({ to, body }); return { delivered: true, messageId: randomUUID() }; },
    sign: async (path: string) => { state.signed.push(path); return `https://signed.example/${path}`; },
    upload: async (path: string) => { state.uploaded.push(path); return `storage://udc-documents/${path}`; },
  };
  state.db.execute = async () => [];
  state.db.transaction = async (callback: any) => callback(state.db);
  state.cleanDb.execute = async () => [];
  state.cleanDb.transaction = async (callback: any) => callback(state.cleanDb);
  state.brainCalls=[];state.markSend=noteExternalSend;
  (globalThis as any).__whatsappRoutes = state;
  const fixtures: Record<string, string> = {
    "../whatsapp/emailVerification": "export const handleEmailVerification=async(phone,text)=>{if(!/^(?:verify email|email code(?:\\s|$))/i.test(text))return null;s.emailCalls=(s.emailCalls||0)+1;return 'Fixture email verification reply';};",
    "../whatsapp/phoneRecovery": "export const handlePhoneRecovery=async(phone,text)=>{if(!/^(?:(?:sign in|recover account|change number)(?:\\s|$)|phone code(?:\\s|$))/i.test(text))return null;s.recoveryCalls=(s.recoveryCalls||0)+1;return 'Fixture private phone recovery reply';};",
    "../whatsapp/customerServiceWindow": "export const recordSignedCustomerInbound=async input=>{s.windowEvidence.push(input);return {recorded:true};};",
    "../whatsapp/shipmentDeliveryReceipts": "export const recordSignedShipmentStatuses=async values=>{s.receipts.push(...values);if(s.failReceipt)throw Error('synthetic_DB_error');return {received:values.length};};",
    "../whatsapp/chatUi": "export const sendDocumentsLink=async()=>false;export const chatAction=(message)=>/^(?:menu|open menu)$/i.test(message.text?.body?.trim()||'')?'menu':null;export const handleChatUi=async(phone,message)=>{if(message.interactive || /^(?:menu|open menu)$/i.test(message.text?.body?.trim()||'')){s.uiCalls=(s.uiCalls||0)+1;return true;}return false;};export const sendChatHome=async(phone)=>{s.homeCalls=(s.homeCalls||0)+1;};",
    "../auth/whatsappSignin": "export const parseSigninCommand=text=>/^(?:CONFIRM LOGIN|LOGIN) [A-F0-9]{16}$/i.test(text)?{}:null;export const handleWhatsAppSignin=async()=>{s.signins=(s.signins||0)+1;return 'Fixture sign in confirmation';};",
    "../akif/intakeConversation": "export const interpretIntakeConversation=async x=>{s.intake.push(x);return s.decision;};",
    "../akif/recordBuyerRequirement": "export const recordPendingBuyerRequirement=async x=>{s.recorded.push(x);return {id:'requirement',status:'pending_admin_review'};};",
    "../whatsapp/guidance": "export const isGuidanceQuestion=x=>s.guidanceReply!==undefined;export const answerGuidance=async(...args)=>{s.guidanceCalls.push(args);if(s.guidanceFailure)throw Error('PRIVATE_MODEL_FAILURE');return s.guidanceReply??null;};export const guidanceMainLanguage=async()=>'';",
    "../akif/intelligence/hermesClient": "export const runConversationChat=async()=>({content:'',raw:{}});",
    "../akif/recordPendingSellerOffer": "export const recordPendingSellerOffer=async x=>{s.recorded.push(x);return {id:'offer',status:'pending_admin_review'};};",
    "../akif/intelligence/workerClient": "export const isAkifWorkerMediaEnabled=()=>true;export const warmAkifWorker=()=>{};export const transcribeAkifAudioDetailed=async()=>({text:s.transcript??'100 MT copper',language:s.language??null});export const synthesizeAkifSpeechTimed=async()=>({bytes:new Uint8Array([1,2]),seconds:s.voiceSeconds??5});",
    "../akif/brainOrchestrator":
      "export const brainKnownFullName=async()=>s.typedName??null;export const brainKnownEmail=async()=>s.typedEmail??null;export const brainHasOpenRegistration=async()=>false;export const isBrainOrchestratorEnabled=()=>Boolean(s.brainMode);export const runBrainTurn=async i=>{s.brainCalls.push(i);const m=s.brainMode;if(!m)return null;if(m.send)s.markSend(i.phone,i.messageId);if(m.throws)throw Error('synthetic_brain_throw');return m.result??null;};export const BRAIN_TOOLS=[];export const reserveOutboundSend=async()=>'reserved';export const markOutboundSend=async()=>{};export const backgroundStillCurrent=async()=>true;",
    "../akif/queueResearch": "export const queueWhatsAppResearch=async()=>null;",
    "../whatsapp/voicePreference": "export const parseVoiceCommand=t=>/^text only$/i.test((t||'').trim())?'text_only':null;export const setTextOnly=async()=>true;export const TEXT_ONLY_CONFIRMATION='Fixture text only';export const VOICE_ON_CONFIRMATION='Fixture voice on';export const getVoiceState=async()=>s.voiceState??'voice';export const recordNotice=async()=>{s.noticeRecorded=(s.noticeRecorded||0)+1;return true;};export const VOICE_NOTICE='Fixture voice notice';",
    "../whatsapp/client": "export const sendWhatsAppText=s.send;export const sendWhatsAppTextWithMenu=s.send;export const sendWhatsAppDocument=async(to,link)=>s.send(to,{link});export const sendWhatsAppImage=async(to,link,caption)=>{s.images=(s.images||[]).concat([{to,link,caption}]);return {delivered:true,messageId:'img-1'};};export const downloadWhatsAppMedia=async()=>({bytes:new Uint8Array([1,2,3]),mimeType:'application/pdf'});export const markReadAndTyping=()=>{};export const markRead=()=>{};export const sendWhatsAppReaction=async()=>({delivered:true,messageId:'rx-1'});export const trackReplyFailures=(fn)=>fn(new Set());export const sendWhatsAppVoiceNote=async(to)=>{s.voice=(s.voice||[]);s.voice.push(to);return s.voiceFail?{delivered:false,reason:'upload_failed'}:{delivered:true};};",
    "../auth/middleware": "export const requireRole=()=> (req,res)=>res.sendStatus(401);",
    "../akif/dealConversationAgent": "export const interpretActiveDealConversation=async()=>{s.dealCalls++;return s.dealDecision;};",
    "../akif/documentIntelligence": "export const processDocumentIntelligence=async()=>({status:'needs_review'});",
    "../supabase/storage": "export const createSignedDownloadUrl=s.sign;export const uploadDocumentBytes=s.upload;export const parseStoragePath=x=>x.startsWith('storage://udc-documents/')?x.slice('storage://udc-documents/'.length):null;",
    "../akif/whatsappIntakeStore": "export const loadWhatsAppIntakeDraft=async()=>s.saved;export const saveWhatsAppIntakeDraft=async x=>{s.saved={...x,lastProviderMessageId:x.providerMessageId};};export const clearWhatsAppIntakeDraft=async()=>{s.saved=null;};",
    "../privacy/whatsappPrivacyGate": "export const whatsappPrivacyGate=async()=>s.privacyReply;",
    "../vault/service": "export const createVaultUploadLink=async()=>({ok:false,error:'vault_base_url_not_configured'});export const acceptUpload=async()=>({ok:false,error:'invalid'});export const listOwnDocumentStatuses=async()=>[];export const lookupLink=async()=>({row:null,check:{ok:false,reason:'invalid'}});export const requestDocumentDeletion=async()=>({ok:false,error:'not_found'});export const logVaultAccess=async()=>{};",
  };
  const output = fileURLToPath(new URL(`./webhook-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: 'import express from "express";import router from "../src/routes/whatsappWebhook.ts";const app=express();app.use(express.json({verify:(req,res,buf)=>{req.rawBody=buf;}}));app.use((req,res,next)=>{req.log={info(){},warn(){},error(){}};next();});app.use(router);export default app;export {buildHumanRelayDraftWithRetry} from "../src/routes/whatsappWebhook.ts";', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "fixtures", setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        if (args.path === "@workspace/db") return { path: "db", namespace: "fixture" };
        if (args.importer.endsWith("/whatsapp/voiceSend.ts") && (args.path === "../akif/intelligence/workerClient" || args.path === "../akif/intelligence/hermesClient")) return { path: args.path, namespace: "fixture" };
        if (args.importer.endsWith("/whatsapp/voiceSend.ts") && args.path === "./client") return { path: "../whatsapp/client", namespace: "fixture" };
        if (args.path === "./voicePreference" && args.importer.endsWith("/whatsapp/voiceSend.ts")) return { path: "../whatsapp/voicePreference", namespace: "fixture" };
        if (args.path === "drizzle-orm") return { path: "orm", namespace: "fixture" };
        if (args.importer.endsWith("/routes/whatsappWebhook.ts") && fixtures[args.path]) return { path: args.path, namespace: "fixture" };
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents:
        'const s=globalThis.__whatsappRoutes;' + (args.path === "db"
          ? 'export const dbTransaction=(run)=>db?.transaction?db.transaction(run):run(db);export const db=s.db;export const dbWrite=async(run)=>run(s.cleanDb);export const READ_ONLY_SQLSTATE=\'25006\';' + names.map(n => `export const ${n}=s.tables.${n};`).join("")
          : args.path === "orm" ? 'export const eq=(a,b)=>({kind:"eq",a,b});export const ne=(a,b)=>({kind:"ne",a,b});export const and=(...args)=>({kind:"and",args});export const or=(...args)=>({kind:"or",args});export const inArray=(a,query)=>({kind:"in",a,query});export const notInArray=(a,query)=>({kind:"notIn",a,query});export const sql=()=>true;export const gte=(a,b)=>({kind:"gte",a,b});export const lt=(a,b)=>({kind:"lt",a,b});export const desc=x=>x;export const isNull=(a)=>({kind:"isNull",a});'
          : fixtures[args.path]) }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  const oldSecret = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = "fixture-secret";
  let server: any;
  const reset = () => {
    for (const n of names) rows[n] = [];
    state.sent = []; state.signed = []; state.uploaded = []; state.intake = []; state.recorded = [];
    state.images = []; state.voice = [];
    state.saved = null; state.privacyReply = null; state.decision = null; state.dealDecision = null;
    state.receipts=[];state.failReceipt=false;state.dedupFailure=false;state.redelivery=false;
    state.windowEvidence=[];
    state.fromWabaPhoneId="qa-sender-number";
    state.brainMode=undefined;state.brainCalls=[];state.dealCalls = 0; state.homeCalls=0; state.guidanceReply=undefined;state.guidanceFailure=false;state.guidanceCalls=[];
  };
  function seedDeal() {
    rows.usersTable = [{ id: "buyer", phone: "10000000001", role: "buyer", status: "verified" }, { id: "seller", phone: "10000000002", role: "seller", status: "verified" }];
    rows.dealsTable = [{ id: "deal-a", dealNumber: "UDC-A", buyerUserId: "buyer", sellerUserId: "seller", status: "negotiation", productId: "copper", quantity: "100", unit: "MT", agreedPrice: "5900", currency: "USD", incoterm: "CIF", destination: "Jebel Ali" }, { id: "deal-b", dealNumber: "UDC-B", buyerUserId: "buyer", sellerUserId: "seller", status: "negotiation" }];
    rows.productsTable = [{ id: "copper", name: "Copper cathode" }];
    rows.dealParticipantsTable = ["deal-a", "deal-b"].flatMap(dealId => ["buyer", "seller"].map(userId => ({ id: randomUUID(), dealId, userId, participantRole: userId, status: "active" })));
    rows.whatsappUserContextsTable = [{ userId: "buyer", activeDealId: "deal-a" }];
  }
  try {
    const { default: app, buildHumanRelayDraftWithRetry } = await import(output);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function message(fields: any, signature = true) {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata:{phone_number_id:state.fromWabaPhoneId??"qa-sender-number"},messages: [{ id: randomUUID(), from: "10000000001", ...fields }] } }] }] });
      return fetch(base + "/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/json",
        "x-hub-signature-256": signature ? "sha256=" + createHmac("sha256", "fixture-secret").update(body).digest("hex") : "sha256=invalid" }, body });
    }
    await t.test('25006 reproduction: gated customer message acks 200 while claim + holding reply are silently lost', async (t) => {
      reset();
      const priorFlag = process.env.UDC_WHATSAPP_DIAG_RECEIPTS;
      const priorInvite = process.env.UDC_INVITE_ONLY;
      const priorAllowed = process.env.UDC_ALLOWED_PHONES;
      process.env.UDC_WHATSAPP_DIAG_RECEIPTS = '1';
      process.env.UDC_INVITE_ONLY = 'on';
      process.env.UDC_ALLOWED_PHONES = '917994133604';
      t.after(() => {
        if (priorFlag === undefined) delete process.env.UDC_WHATSAPP_DIAG_RECEIPTS; else process.env.UDC_WHATSAPP_DIAG_RECEIPTS = priorFlag;
        if (priorInvite === undefined) delete process.env.UDC_INVITE_ONLY; else process.env.UDC_INVITE_ONLY = priorInvite;
        if (priorAllowed === undefined) delete process.env.UDC_ALLOWED_PHONES; else process.env.UDC_ALLOWED_PHONES = priorAllowed;
      });
      const msgId = 'wamid.synthetic.freeze.' + randomUUID();
      const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'qa-sender-number' }, messages: [{ id: msgId, from: '10000000099', type: 'text', text: { body: 'hello, is this open?' } }] } }] }] });
      const post = () => fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'fixture-secret').update(body).digest('hex') }, body });

      // Poisoned pool: raw-db writes throw 25006; dbWrite-wrapped paths land on the clean session.
      state.poison = true;
      const r1 = await post();
      assert.equal(r1.status, 200, 'handler still acks 200 under 25006 (no Meta redelivery follows)');
      await new Promise(r => setTimeout(r, 100));
      assert.equal(state.sent.length, 0, 'first-contact holding reply is silently skipped when the gate mark fails');
      const claims = rows.whatsappInboundDedupTable;
      assert.equal(claims.length, 1, 'claim was written via dbWrite (clean session)');
      assert.equal(claims[0].completedAt ?? null, null, 'completion write silently failed: permanent uncompleted claim');
      const receipts = rows.whatsappWebhookReceiptsTable;
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].handlerOutcome, '200', 'receipt shows a clean 200 - indistinguishable from success before the diagnostic');
      assert.equal(receipts[0].payloadClass, 'messages');

      // Recovery: poison cleared, a redelivery would now complete - but Meta never redelivers after a 200.
      state.poison = false;
      const r2 = await post();
      assert.equal(r2.status, 200);
      await new Promise(r => setTimeout(r, 100));
      // (The gate's holding-reply send uses the real WhatsApp client here, so the
      // send itself is not observable in this harness; the gate source shows
      // first=true -> d.send once the mark succeeds.)
      assert.notEqual(rows.whatsappInboundDedupTable[0].completedAt ?? null, null, 'redelivery completes the claim');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await unlink(output); delete (globalThis as any).__whatsappRoutes;
    if (oldSecret === undefined) delete process.env.WHATSAPP_APP_SECRET; else process.env.WHATSAPP_APP_SECRET = oldSecret;
  }
});
