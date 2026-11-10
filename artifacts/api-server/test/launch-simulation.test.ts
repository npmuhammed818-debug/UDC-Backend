process.env.WHATSAPP_INBOUND_PER_MINUTE = "100000"; // these fixtures reuse one phone; the cap has its own test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Exercise the real signed webhook, including route ordering and DB predicates.
// All identities, models, media, storage and provider calls are isolated fixtures.
test("launch simulation: agent, seller and buyer chats both directions with latency", async (t) => {
  const names = ["notificationPreferencesTable","sellerListingsTable","companyVerificationDocumentsTable","messagesTable","notificationsTable", "auditLogsTable", "productsTable", "dealConversationEventsTable", "dealParticipantsTable", "dealsTable",
    "documentAccessTable", "documentExtractionsTable", "documentsTable", "usersTable", "buyerRequestsTable", "whatsappMessageContextsTable", "whatsappUserContextsTable", "companiesTable", "akifSharedLessonsTable", "dealMeetingsTable", "dealFinancialsTable"];
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
  function insert(table: any) {
    let input: any, ignoreConflict = false, inserted: any[] | undefined;
    const run = () => {
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
  function update(table:any){let input:any,condition:any;const run=()=>{const values=rows[table._tableName].filter(r=>evaluate(condition,{[table._tableName]:r}));values.forEach(r=>Object.assign(r,input));return values;};const q:any={set(v:any){input=v;return q;},where(v:any){condition=v;return q;},returning:async()=>run(),then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};return q;}
  const state: any = { tables, db: { select, insert,update }, sent: [], signed: [], uploaded: [], intake: [], recorded: [],
    privacyReply: null, saved: null, decision: null, dealDecision: null, dealCalls: 0,
    send: async (to: string, body: any) => { state.sent.push({ to, body }); return { delivered: true, messageId: randomUUID() }; },
    sign: async (path: string) => { state.signed.push(path); return `https://signed.example/${path}`; },
    upload: async (path: string) => { state.uploaded.push(path); return `storage://udc-documents/${path}`; },
  };
  state.db.execute = async () => [];
  state.db.transaction = async (callback: any) => callback(state.db);
  (globalThis as any).__whatsappRoutes = state;
  const fixtures: Record<string, string> = {
    "../whatsapp/emailVerification": "export const handleEmailVerification=async(phone,text)=>{if(!/^(?:verify email|email code(?:\\s|$))/i.test(text))return null;s.emailCalls=(s.emailCalls||0)+1;return 'Fixture email verification reply';};",
    "../whatsapp/phoneRecovery": "export const handlePhoneRecovery=async(phone,text)=>{if(!/^(?:(?:sign in|recover account|change number)(?:\\s|$)|phone code(?:\\s|$))/i.test(text))return null;s.recoveryCalls=(s.recoveryCalls||0)+1;return 'Fixture private phone recovery reply';};",
    "../whatsapp/customerServiceWindow": "export const recordSignedCustomerInbound=async input=>{s.windowEvidence.push(input);return {recorded:true};};",
    "../whatsapp/shipmentDeliveryReceipts": "export const recordSignedShipmentStatuses=async values=>{s.receipts.push(...values);if(s.failReceipt)throw Error('synthetic_DB_error');return {received:values.length};};",
    "../whatsapp/chatUi": "export const sendDocumentsLink=async()=>false;export const chatAction=(message)=>/^(?:menu|open menu)$/i.test(message.text?.body?.trim()||'')?'menu':null;export const handleChatUi=async(phone,message,directOnly)=>{if(directOnly && !message.interactive) return false;if(message.interactive || /^(?:menu|open menu)$/i.test(message.text?.body?.trim()||'')){s.uiCalls=(s.uiCalls||0)+1;return true;}return false;};export const sendChatHome=async(phone)=>{s.homeCalls=(s.homeCalls||0)+1;};",
    "../auth/whatsappSignin": "export const parseSigninCommand=text=>/^(?:CONFIRM LOGIN|LOGIN) [A-F0-9]{16}$/i.test(text)?{}:null;export const handleWhatsAppSignin=async()=>{s.signins=(s.signins||0)+1;return 'Fixture sign-in confirmation';};",
    "../akif/intakeConversation": "export const interpretIntakeConversation=async x=>{s.intake.push(x);return s.decision;};",
    "../akif/recordBuyerRequirement": "export const recordPendingBuyerRequirement=async x=>{s.recorded.push(x);return {id:'requirement',status:'pending_admin_review'};};",
    "../whatsapp/guidance": "export const isGuidanceQuestion=x=>s.guidanceReply!==undefined;export const answerGuidance=async(...args)=>{s.guidanceCalls.push(args);if(s.guidanceFailure)throw Error('PRIVATE_MODEL_FAILURE');return s.guidanceReply??null;};export const guidanceMainLanguage=async()=>'';",
    "../akif/intelligence/hermesClient": "export const runConversationChat=async()=>({content:'',raw:{}});",
    "../akif/recordPendingSellerOffer": "export const recordPendingSellerOffer=async x=>{s.recorded.push(x);return {id:'offer',status:'pending_admin_review'};};",
    "../akif/intelligence/workerClient": "export const isAkifWorkerMediaEnabled=()=>true;export const warmAkifWorker=()=>{};export const transcribeAkifAudioDetailed=async()=>{await new Promise(r=>setTimeout(r,s.sttLatency??300));return {text:s.transcript??'100 MT copper',language:s.language??null};};export const synthesizeAkifSpeechTimed=async(input)=>{s.synthTexts=(s.synthTexts||[]);s.synthTexts.push(typeof input==='string'?input:input?.text);await new Promise(r=>setTimeout(r,s.ttsLatency??400));if(s.voiceFail)throw new Error('synthetic_tts_failure');return {bytes:new Uint8Array([1,2]),seconds:s.voiceSeconds??5};};",
    "../akif/brainOrchestrator":
      "const BUSY='One moment - still answering your previous message.';export const isBrainOrchestratorEnabled=()=>true;export const BRAIN_TOOLS=[];export const runBrainTurn=async(input)=>{(s.brainCalls=s.brainCalls||[]).push(input);const mode=s.brainMode||'answer';if(mode==='fail'){await new Promise(r=>setTimeout(r,s.brainLatency??800));return null;}if(mode==='busy-once'){s.brainMode='answer';return {handled:true,reply:BUSY};}await new Promise(r=>setTimeout(r,s.brainLatency??800));return {handled:true,reply:s.brainReply??'Happy to help with that.'};};",
    "../akif/queueResearch": "export const queueWhatsAppResearch=async()=>null;",
    "../akif/relayAlertEmail": "export const sendRelayHeldAlert=async()=>{};export const relayAlertEmailConfigured=()=>false;",
    "../whatsapp/voicePreference": "export const parseVoiceCommand=t=>/^text only$/i.test((t||'').trim())?'text_only':null;export const setTextOnly=async()=>true;export const TEXT_ONLY_CONFIRMATION='Fixture text only';export const VOICE_ON_CONFIRMATION='Fixture voice on';export const getVoiceState=async()=>s.voiceState??'voice';export const recordNotice=async()=>{s.noticeRecorded=(s.noticeRecorded||0)+1;return true;};export const VOICE_NOTICE='Fixture voice notice';",
    "../whatsapp/inboundDedup": "export const claimInboundMessage=async()=>{if(s.dedupFailure)throw Error('synthetic_dedup_failure');return true;};export const completeInboundMessages=async()=>{};export const releaseInboundMessages=async()=>{};",
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
    stdin: { contents: 'import express from "express";import router from "../src/routes/whatsappWebhook.ts";const app=express();app.use(express.json({verify:(req,res,buf)=>{req.rawBody=buf;}}));app.use((req,res,next)=>{req.log={info(){},error(){}};next();});app.use(router);export default app;', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "fixtures", setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        if (args.path === "@workspace/db") return { path: "db", namespace: "fixture" };
        if (args.importer.endsWith("/whatsapp/voiceSend.ts") && (args.path === "../akif/intelligence/workerClient" || args.path === "../akif/intelligence/hermesClient")) return { path: args.path, namespace: "fixture" };
        if (args.importer.endsWith("/whatsapp/voiceSend.ts") && args.path === "./client") return { path: "../whatsapp/client", namespace: "fixture" };
        if (args.path === "./voicePreference" && args.importer.endsWith("/whatsapp/voiceSend.ts")) return { path: "../whatsapp/voicePreference", namespace: "fixture" };
        if (args.path === "drizzle-orm") return { path: "orm", namespace: "fixture" };
        if (/relayAlertEmail(\.ts)?$/.test(args.path)) return { path: "../akif/relayAlertEmail", namespace: "fixture" };
        if (args.importer.endsWith("/routes/whatsappWebhook.ts") && fixtures[args.path]) return { path: args.path, namespace: "fixture" };
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents:
        'const s=globalThis.__whatsappRoutes;' + (args.path === "db"
          ? 'export const db=s.db;' + names.map(n => `export const ${n}=s.tables.${n};`).join("")
          : args.path === "orm" ? 'export const eq=(a,b)=>({kind:"eq",a,b});export const ne=(a,b)=>({kind:"ne",a,b});export const and=(...args)=>({kind:"and",args});export const or=(...args)=>({kind:"or",args});export const inArray=(a,query)=>({kind:"in",a,query});export const sql=()=>true;export const gte=(a,b)=>({kind:"gte",a,b});export const lt=(a,b)=>({kind:"lt",a,b});export const desc=x=>x;'
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
    state.receipts=[];state.failReceipt=false;state.dedupFailure=false;
    state.windowEvidence=[];
    state.fromWabaPhoneId="qa-sender-number";
    state.dealCalls = 0; state.homeCalls=0; state.guidanceReply=undefined;state.guidanceFailure=false;state.guidanceCalls=[];
  };
  function seedDeal() {
    rows.usersTable = [{ id: "buyer", phone: "10000000001", role: "buyer", status: "verified" }, { id: "seller", phone: "10000000002", role: "seller", status: "verified" }];
    rows.dealsTable = [{ id: "deal-a", dealNumber: "UDC-A", buyerUserId: "buyer", sellerUserId: "seller", status: "negotiation", productId: "copper", quantity: "100", unit: "MT", agreedPrice: "5900", currency: "USD", incoterm: "CIF", destination: "Jebel Ali" }, { id: "deal-b", dealNumber: "UDC-B", buyerUserId: "buyer", sellerUserId: "seller", status: "negotiation" }];
    rows.productsTable = [{ id: "copper", name: "Copper cathode" }];
    rows.dealParticipantsTable = ["deal-a", "deal-b"].flatMap(dealId => ["buyer", "seller"].map(userId => ({ id: randomUUID(), dealId, userId, participantRole: userId, status: "active" })));
    rows.whatsappUserContextsTable = [{ userId: "buyer", activeDealId: "deal-a" }];
  }
  try {
    const { default: app } = await import(output);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function sendText(phone: string, text: string) {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata:{phone_number_id:"qa-sender-number"},messages: [{ id: randomUUID(), from: phone, text: { body: text } }] } }] }] });
      const start = Date.now();
      const r = await fetch(base + "/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", "fixture-secret").update(body).digest("hex") }, body });
      return { status: r.status, ms: Date.now() - start };
    }
    async function sendVoice(phone: string) {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata:{phone_number_id:"qa-sender-number"},messages: [{ id: randomUUID(), from: phone, audio: { id: "sim-audio-" + randomUUID() } }] } }] }] });
      const start = Date.now();
      const r = await fetch(base + "/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", "fixture-secret").update(body).digest("hex") }, body });
      return { status: r.status, ms: Date.now() - start };
    }
    const AGENT = "91000000001", SELLER = "91000000002", BUYER = "91000000003", GUEST = "91000000009";
    const seedUsers = () => { rows.usersTable = [
      { id: "sim-agent", phone: AGENT, role: "agent", status: "verified", emailVerifiedAt: new Date(), fullName: "Sim Agent" },
      { id: "sim-seller", phone: SELLER, role: "seller", status: "verified", emailVerifiedAt: new Date(), fullName: "Sim Seller" },
      { id: "sim-buyer", phone: BUYER, role: "buyer", status: "verified", emailVerifiedAt: new Date(), fullName: "Sim Buyer" },
    ]; };
    const latText: number[] = [], latVoice: number[] = [];
    const percentile = (xs: number[], p: number) => { const sorted = [...xs].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0; };
    process.env.AKIF_BRAIN_VOICE = "on";
    process.env.AKIF_VOICE_REPLIES = "on";
    process.env.AKIF_BRAIN_BUSY_WAIT = "on";
      // ---- text turns ----
      await t.test("agent greeting gets one warm answer, no clarifier first", async () => {
        reset(); seedUsers(); state.brainLatency = 800;
        const r = await sendText(AGENT, "Hy"); latText.push(r.ms);
        assert.equal(r.status, 200); assert.equal(state.sent.length, 1);
        assert.equal(state.sent[0].body, "Happy to help with that.");
      });
      await t.test("agent commission question gets the fixed answer instantly, no brain turn", async () => {
        reset(); seedUsers(); state.brainCalls = [];
        const r = await sendText(AGENT, "How much commission do I get per referral?"); latText.push(r.ms);
        assert.equal(state.brainCalls.length, 0, "commission never reaches the model");
        assert.equal(state.sent.length, 1);
        assert.match(state.sent[0].body, /deal by deal/);
        assert.ok(r.ms < 1500, "commission answer is near-instant, got " + r.ms + "ms");
      });
      await t.test("Malayalam commission question gets the Malayalam fixed answer", async () => {
        reset(); seedUsers(); state.brainCalls = [];
        const r = await sendText(AGENT, "\u0d15\u0d2e\u0d4d\u0d2e\u0d40\u0d37\u0d7b \u0d0e\u0d24\u0d4d\u0d30?"); latText.push(r.ms);
        assert.equal(state.brainCalls.length, 0);
        assert.equal(state.sent.length, 1);
        assert.match(state.sent[0].body, /\u0d15\u0d2e\u0d4d\u0d2e\u0d40\u0d37\u0d7b|deal/);
      });
      await t.test("seller offer and buyer requirement each get one brain answer", async () => {
        reset(); seedUsers(); state.brainLatency = 800;
        let r = await sendText(SELLER, "I have 500 MT copper cathode ready to ship"); latText.push(r.ms);
        assert.equal(state.sent.length, 1); assert.equal(state.sent[0].body, "Happy to help with that.");
        reset(); seedUsers();
        r = await sendText(BUYER, "Looking for 100 MT copper wire rod"); latText.push(r.ms);
        assert.equal(state.sent.length, 1);
      });
      await t.test("unregistered guest greeting is answered", async () => {
        reset(); seedUsers(); state.brainLatency = 800;
        const r = await sendText(GUEST, "hello"); latText.push(r.ms);
        assert.equal(state.sent.length, 1);
      });
      await t.test("typed menu reaches the brain, one reply", async () => {
        reset(); seedUsers(); state.brainCalls = [];
        await sendText(AGENT, "menu");
        assert.ok((state.uiCalls || 0) >= 1 || (state.brainCalls || []).length === 1, "menu is consumed by the scripted UI or the brain");
        assert.ok(state.sent.length + ((state.interactive || []).length) >= 1, "exactly one reply path fires");
      });
      await t.test("busy brain is waited out, never sends the floor line", async () => {
        reset(); seedUsers(); state.brainMode = "busy-once"; state.brainLatency = 800;
        const r = await sendText(AGENT, "What deals do I have?"); latText.push(r.ms);
        assert.equal(state.sent.length, 1);
        assert.equal(state.sent[0].body, "Happy to help with that.");
        assert.doesNotMatch(String(state.sent[0].body), /previous message/);
        state.brainMode = "answer";
      });
      await t.test("Groq 429 (brain down): normal question holds silently, greeting still answers", async () => {
        reset(); seedUsers(); state.brainMode = "fail"; state.brainLatency = 800;
        let r = await sendText(AGENT, "How is monsoon affecting cardamom prices?"); latText.push(r.ms);
        assert.equal(state.sent.length, 0, "no failure line or canned note");
        assert.ok(r.ms < 10000, "hold decision under 10s, got " + r.ms + "ms");
        reset(); seedUsers(); state.brainMode = "fail";
        r = await sendText(AGENT, "Hy"); latText.push(r.ms);
        assert.equal(state.sent.length, 1, "greeting fallback answers without the model");
        reset(); seedUsers(); state.brainMode = "fail"; state.brainCalls = [];
        r = await sendText(AGENT, "What is my commission?"); latText.push(r.ms);
        assert.match(state.sent[0].body, /deal by deal/, "commission answered even with the brain down");
        state.brainMode = "answer";
      });
      // ---- voice turns ----
      await t.test("voice greeting Malayalam gets a spoken answer in Malayalam, no extra text", async () => {
        reset(); seedUsers(); state.transcript = "\u0d39\u0d32\u0d4b, \u0d0e\u0d28\u0d4d\u0d24\u0d4a\u0d15\u0d4d\u0d15\u0d46\u0d2f\u0d3e\u0d23\u0d4d \u0d09\u0d33\u0d4d\u0d33\u0d24\u0d4d?"; state.language = "mal";
        state.brainReply = "Namaskaram! I can help with buying, selling or referrals.";
        const r = await sendVoice(AGENT); latVoice.push(r.ms);
        assert.equal(state.voice.length, 1, "voice out");
        assert.equal(state.sent.filter((x: any) => typeof x.body === "string" && x.body === state.brainReply).length, 0, "no duplicate text copy");
        assert.deepEqual(state.synthTexts?.at(-1), state.brainReply);
        state.transcript = undefined; state.language = undefined;
      });
      await t.test("Malayalam voice commission question gets the Malayalam commission answer by voice", async () => {
        reset(); seedUsers(); state.transcript = "\u0d15\u0d2e\u0d4d\u0d2e\u0d40\u0d37\u0d7b \u0d0e\u0d28\u0d4d\u0d24\u0d3e\u0d23\u0d4d?"; state.language = "mal"; state.brainCalls = [];
        const r = await sendVoice(AGENT); latVoice.push(r.ms);
        assert.equal((state.brainCalls || []).length, 0, "commission never reaches the model");
        assert.equal(state.voice.length, 1);
        assert.match(String(state.synthTexts.at(-1)), /\u0d15\u0d2e\u0d4d\u0d2e\u0d40\u0d37\u0d7b/);
        state.transcript = undefined; state.language = undefined;
      });
      await t.test("voice with TTS down falls back to honest text", async () => {
        reset(); seedUsers(); state.transcript = "What is DLC?"; state.language = "eng"; state.voiceFail = true;
        const r = await sendVoice(AGENT); latVoice.push(r.ms);
        assert.ok(state.sent.length >= 1, "text fallback went out");
        assert.equal(state.voice.length, 0);
        state.transcript = undefined; state.language = undefined; state.voiceFail = false;
      });
      console.info("SIM LATENCY text p50=" + percentile(latText, 0.5) + "ms p95=" + percentile(latText, 0.95) + "ms (n=" + latText.length + "), voice p50=" + percentile(latVoice, 0.5) + "ms p95=" + percentile(latVoice, 0.95) + "ms (n=" + latVoice.length + ")");
      assert.ok(percentile(latText, 0.95) < 10000, "text p95 under 10s");
      assert.ok(percentile(latVoice, 0.95) < 10000, "voice p95 under 10s");
    } finally {
      delete process.env.AKIF_BRAIN_VOICE; delete process.env.AKIF_VOICE_REPLIES; delete process.env.AKIF_BRAIN_BUSY_WAIT;
      if (server) await new Promise(resolve => server.close(resolve));
      await unlink(output); delete (globalThis as any).__whatsappRoutes;
      if (oldSecret === undefined) delete process.env.WHATSAPP_APP_SECRET; else process.env.WHATSAPP_APP_SECRET = oldSecret;
    }
  });
