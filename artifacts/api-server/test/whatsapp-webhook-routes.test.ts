import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Exercise the real signed webhook, including route ordering and DB predicates.
// All identities, models, media, storage and provider calls are isolated fixtures.
test("WhatsApp webhook intake and private media acceptance", async (t) => {
  const names = ["notificationsTable", "auditLogsTable", "productsTable", "dealConversationEventsTable", "dealParticipantsTable", "dealsTable",
    "documentAccessTable", "documentsTable", "usersTable", "whatsappMessageContextsTable", "whatsappUserContextsTable"];
  const tables: any = Object.fromEntries(names.map(name => [name, new Proxy({ _tableName: name }, {
    get(target, key) { return key === "_tableName" ? target._tableName : { kind: "column", table: name, key }; },
  })]));
  const rows: Record<string, any[]> = Object.fromEntries(names.map(name => [name, []]));
  const evaluate = (node: any, row: any): any => {
    if (node?.kind === "column") return row[node.table]?.[node.key];
    if (node?.kind === "eq") return evaluate(node.a, row) === evaluate(node.b, row);
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
      orderBy() { return q; }, limit(n: number) { maximum = n; return q; },
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
      const records = (Array.isArray(input) ? input : [input]).map(item => ({ id: randomUUID(), ...item }));
      rows[table._tableName].push(...records);
      return inserted = records;
    };
    const q: any = { values(v: any) { input = v; return q; },
      onConflictDoNothing() { ignoreConflict = true; return q; }, onConflictDoUpdate() { return q; },
      returning(fields?: any) { return Promise.resolve(run().map(r => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, r[v.key]])) : r)); },
      then(resolve: any, reject: any) { return Promise.resolve().then(run).then(resolve, reject); } };
    return q;
  }
  const state: any = { tables, db: { select, insert }, sent: [], signed: [], uploaded: [], intake: [], recorded: [],
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
    "../whatsapp/chatUi": "export const chatAction=(message)=>/^(?:menu|open menu)$/i.test(message.text?.body?.trim()||'')?'menu':null;export const handleChatUi=async(phone,message)=>{if(message.interactive || /^(?:menu|open menu)$/i.test(message.text?.body?.trim()||'')){s.uiCalls=(s.uiCalls||0)+1;return true;}return false;};export const sendChatHome=async(phone)=>{s.homeCalls=(s.homeCalls||0)+1;};",
    "../auth/whatsappSignin": "export const parseSigninCommand=text=>/^(?:CONFIRM LOGIN|LOGIN) [A-F0-9]{16}$/i.test(text)?{}:null;export const handleWhatsAppSignin=async()=>{s.signins=(s.signins||0)+1;return 'Fixture sign-in confirmation';};",
    "../akif/intakeConversation": "export const interpretIntakeConversation=async x=>{s.intake.push(x);return s.decision;};",
    "../akif/recordBuyerRequirement": "export const recordPendingBuyerRequirement=async x=>{s.recorded.push(x);return {id:'requirement',status:'pending_admin_review'};};",
    "../whatsapp/guidance": "export const isGuidanceQuestion=x=>s.guidanceReply!==undefined;export const answerGuidance=async(...args)=>{s.guidanceCalls.push(args);if(s.guidanceFailure)throw Error('PRIVATE_MODEL_FAILURE');return s.guidanceReply??null;};",
    "../akif/recordPendingSellerOffer": "export const recordPendingSellerOffer=async x=>{s.recorded.push(x);return {id:'offer',status:'pending_admin_review'};};",
    "../akif/intelligence/workerClient": "export const isAkifWorkerMediaEnabled=()=>true;export const transcribeAkifAudio=async()=> '100 MT copper';",
    "../akif/queueResearch": "export const queueWhatsAppResearch=async()=>null;",
    "../whatsapp/client": "export const sendWhatsAppText=s.send;export const sendWhatsAppTextWithMenu=s.send;export const sendWhatsAppDocument=async(to,link)=>s.send(to,{link});export const downloadWhatsAppMedia=async()=>({bytes:new Uint8Array([1,2,3]),mimeType:'application/pdf'});",
    "../auth/middleware": "export const requireRole=()=> (req,res)=>res.sendStatus(401);",
    "../akif/dealConversationAgent": "export const interpretActiveDealConversation=async()=>{s.dealCalls++;return s.dealDecision;};",
    "../akif/documentIntelligence": "export const processDocumentIntelligence=async()=>({status:'needs_review'});",
    "../supabase/storage": "export const createSignedDownloadUrl=s.sign;export const uploadDocumentBytes=s.upload;export const parseStoragePath=x=>x.startsWith('storage://udc-documents/')?x.slice('storage://udc-documents/'.length):null;",
    "../akif/whatsappIntakeStore": "export const loadWhatsAppIntakeDraft=async()=>s.saved;export const saveWhatsAppIntakeDraft=async x=>{s.saved={...x,lastProviderMessageId:x.providerMessageId};};export const clearWhatsAppIntakeDraft=async()=>{s.saved=null;};",
    "../privacy/whatsappPrivacyGate": "export const whatsappPrivacyGate=async()=>s.privacyReply;",
  };
  const output = fileURLToPath(new URL(`./webhook-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: 'import express from "express";import router from "../src/routes/whatsappWebhook.ts";const app=express();app.use(express.json({verify:(req,res,buf)=>{req.rawBody=buf;}}));app.use((req,res,next)=>{req.log={info(){},error(){}};next();});app.use(router);export default app;', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "fixtures", setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        if (args.path === "@workspace/db") return { path: "db", namespace: "fixture" };
        if (args.path === "drizzle-orm") return { path: "orm", namespace: "fixture" };
        if (args.importer.endsWith("/routes/whatsappWebhook.ts") && fixtures[args.path]) return { path: args.path, namespace: "fixture" };
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents:
        'const s=globalThis.__whatsappRoutes;' + (args.path === "db"
          ? 'export const db=s.db;' + names.map(n => `export const ${n}=s.tables.${n};`).join("")
          : args.path === "orm" ? 'export const eq=(a,b)=>({kind:"eq",a,b});export const and=(...args)=>({kind:"and",args});export const or=(...args)=>({kind:"or",args});export const inArray=(a,query)=>({kind:"in",a,query});export const sql=()=>true;export const desc=x=>x;'
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
    state.saved = null; state.privacyReply = null; state.decision = null; state.dealDecision = null;
    state.dealCalls = 0; state.homeCalls=0; state.guidanceReply=undefined;state.guidanceFailure=false;state.guidanceCalls=[];
  };
  function seedDeal() {
    rows.usersTable = [{ id: "buyer", phone: "10000000001", role: "buyer", status: "verified" }, { id: "seller", phone: "10000000002", role: "seller", status: "verified" }];
    rows.dealsTable = [{ id: "deal-a", dealNumber: "UDC-A", buyerUserId: "buyer", sellerUserId: "seller", status: "negotiation", productId: "copper", quantity: "100", unit: "MT", agreedPrice: "5900", currency: "USD", incoterm: "CIF", destination: "Jebel Ali" }, { id: "deal-b", dealNumber: "UDC-B", buyerUserId: "buyer", sellerUserId: "seller", status: "negotiation" }];
    rows.productsTable = [{ id: "copper", name: "Copper cathode" }];
    rows.dealParticipantsTable = ["deal-a", "deal-b"].flatMap(dealId => ["buyer", "seller"].map(userId => ({ id: randomUUID(), dealId, userId, status: "active" })));
    rows.whatsappUserContextsTable = [{ userId: "buyer", activeDealId: "deal-a" }];
  }
  try {
    const { default: app } = await import(output);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function message(fields: any, signature = true) {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: randomUUID(), from: "10000000001", ...fields }] } }] }] });
      return fetch(base + "/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/json",
        "x-hub-signature-256": signature ? "sha256=" + createHmac("sha256", "fixture-secret").update(body).digest("hex") : "sha256=invalid" }, body });
    }
    await t.test('unverified quoted learning questions bypass deal and intake; voice questions answer without execution',async()=>{
      reset();rows.usersTable=[{id:'pending-buyer',phone:'10000000001',role:'buyer',status:'under_review'}];
      state.guidanceReply='DLC means Documentary Letter of Credit.';
      await message({text:{body:'What is dlc?'},context:{id:'ask-akif-menu'}});
      assert.equal(state.sent.at(-1).body,state.guidanceReply);assert.deepEqual(state.intake,[]);assert.equal(state.dealCalls,0);assert.deepEqual(state.recorded,[]);
      await message({audio:{id:'voice-question'}});
      assert.equal(state.sent.at(-1).body,state.guidanceReply);assert.equal(state.guidanceCalls.at(-1)[3],true);assert.deepEqual(state.recorded,[]);assert.equal(rows.dealConversationEventsTable.length,0);
      state.guidanceFailure=true;await message({audio:{id:'voice-answer-failure'}});
      assert.match(state.sent.at(-1).body,/read your voice note, but couldn’t prepare an answer/);
      assert.doesNotMatch(state.sent.at(-1).body,/couldn.t read|PRIVATE/);state.guidanceFailure=false;
      state.privacyReply='Reply AGREE';state.guidanceCalls=[];
      await message({text:{body:'What is dlc?'}});assert.deepEqual(state.guidanceCalls,[]);
    });
    await t.test("accepting consent opens role selection without sending AGREE to trade intelligence", async () => {
      reset();state.privacyReply={kind:"consent_accepted"};
      assert.equal((await message({text:{body:"AGREE"}})).status,200);
      assert.equal(state.homeCalls,1);
      assert.deepEqual(state.intake,[]);
      assert.deepEqual(state.sent,[]);
      assert.deepEqual(state.recorded,[]);
    });
    await t.test("invalid signatures and consent gates cannot reach trade processing", async () => {
      reset(); assert.equal((await message({ text: { body: "hello" } }, false)).status, 401);
      assert.deepEqual(state.sent, []); assert.deepEqual(state.intake, []);
      state.privacyReply = "Reply AGREE";
      assert.equal((await message({ text: { body: "hello" } })).status, 200);
      assert.equal(state.sent[0].body, "Reply AGREE"); assert.deepEqual(state.intake, []);
    });
    await t.test('button, list and form replies pass through signature, consent and blocked-account checks',async()=>{
      reset();state.uiCalls=0;
      for(const interactive of [{type:'button_reply',button_reply:{id:'udc:buyer'}},{type:'list_reply',list_reply:{id:'udc:deals'}},{type:'nfm_reply',nfm_reply:{response_json:'{}'}}]){
        await message({interactive},false);assert.equal(state.uiCalls,0);
        state.privacyReply='Reply AGREE';await message({interactive});assert.equal(state.uiCalls,0);
        state.privacyReply=null;rows.usersTable=[{phone:'10000000001',status:'suspended'}];await message({interactive});assert.equal(state.uiCalls,0);rows.usersTable=[];
      }
      await message({interactive:{type:'list_reply',list_reply:{id:'udc:deals'}}});assert.equal(state.uiCalls,1);assert.deepEqual(state.intake,[]);
    });
    await t.test('sign-in commands require a valid signed webhook, consent and a nonblocked sender',async()=>{
      reset();state.signins=0;
      const text={text:{body:'LOGIN AABBCCDDEEFF0011'}};
      await message(text,false);assert.equal(state.signins,0);
      state.privacyReply='Reply AGREE';await message(text);assert.equal(state.signins,0);
      state.privacyReply=null;rows.usersTable.push({phone:'10000000001',status:'suspended'});
      await message(text);assert.equal(state.signins,0);rows.usersTable=[];
      await message(text);assert.equal(state.signins,1);assert.equal(state.sent.at(-1).body,'Fixture sign-in confirmation');assert.deepEqual(state.intake,[]);
    });
    await t.test("phone recovery remains behind Meta signature and consent and never reaches AI",async()=>{
      reset();state.recoveryCalls=0;
      const request={text:{body:"Sign in owner@example.invalid"}};
      await message(request,false);assert.equal(state.recoveryCalls,0);
      state.privacyReply="Reply AGREE";await message(request);assert.equal(state.recoveryCalls,0);
      state.privacyReply=null;rows.usersTable.push({phone:"10000000001",status:"suspended"});
      await message(request);assert.equal(state.recoveryCalls,0);rows.usersTable=[];
      await message(request);assert.equal(state.recoveryCalls,1);
      assert.equal(state.sent.at(-1).body,"Fixture private phone recovery reply");
      await message({text:{body:"Phone code 123456"}});assert.equal(state.recoveryCalls,2);
      assert.deepEqual(state.intake,[]);assert.deepEqual(state.recorded,[]);
      assert.equal(state.dealCalls,0);assert.deepEqual(state.guidanceCalls,[]);
    });
    await t.test('email code commands require signed consented nonblocked senders and never reach AI or memory',async()=>{
      reset();state.emailCalls=0;
      const text={text:{body:'Email code 123456'}};
      await message(text,false);assert.equal(state.emailCalls,0);
      state.privacyReply='Reply AGREE';await message(text);assert.equal(state.emailCalls,0);
      state.privacyReply=null;rows.usersTable.push({phone:'10000000001',status:'suspended'});await message(text);assert.equal(state.emailCalls,0);
      rows.usersTable=[];await message(text);assert.equal(state.emailCalls,1);
      assert.equal(state.sent.at(-1).body,'Fixture email verification reply');assert.deepEqual(state.intake,[]);assert.deepEqual(state.recorded,[]);assert.equal(state.dealCalls,0);assert.deepEqual(state.guidanceCalls,[]);assert.equal(rows.dealConversationEventsTable.length,0);
    });
    await t.test("agent registration is consent-gated, pending, idempotent and never changes an existing trader role", async () => {
      reset(); state.privacyReply = "Reply AGREE";
      await message({ text: { body: "Register me as an agent" } }); assert.equal(rows.usersTable.length, 0);
      state.privacyReply = null;
      rows.usersTable.push({ id: "admin", role: "admin", status: "verified" });
      await message({ text: { body: "Register me as an agent" } });
      const agent = rows.usersTable.find(user => user.phone === "10000000001");
      assert.equal(agent.role, "agent"); assert.equal(agent.status, "pending");
      assert.equal(rows.auditLogsTable.filter(row => row.action === "agent_registration_requested").length, 1);
      assert.equal(rows.notificationsTable[0].userId, "admin"); assert.deepEqual(state.intake, []); assert.equal(state.dealCalls, 0);
      await message({ text: { body: "I'm a broker" } }); assert.equal(rows.usersTable.length, 2);
      assert.equal(rows.auditLogsTable.filter(row => row.action === "agent_registration_requested").length, 1);
      assert.match(state.sent.at(-1).body, /already pending/);
      agent.status = "verified"; await message({ text: { body: "I am an agent" } }); assert.match(state.sent.at(-1).body, /already approved/);
      reset(); seedDeal(); await message({ text: { body: "Register me as an agent" } });
      assert.equal(rows.usersTable[0].role, "buyer"); assert.equal(rows.usersTable[0].status, "verified");
      assert.match(state.sent.at(-1).body, /review a role change/); assert.deepEqual(state.intake, []);
    });
    await t.test("first buyer inquiry with a price is captured, not blocked as negotiation", async () => {
      reset(); state.decision = { role: "buyer", newIntake: true, fields: { product: "Copper cathode", quantity: 100, targetPrice: 5900, destination: "Jebel Ali", incoterm: "CIF" }, reply: "I’ll send this for UDC review." };
      assert.equal((await message({ text: { body: "I need 100 MT copper cathode USD 5900 CIF Jebel Ali" } })).status, 200);
      assert.equal(state.recorded[0]?.targetPrice, 5900);
      assert.equal(state.recorded[0]?.destination, "Jebel Ali");
      assert.equal(state.sent[0].body, state.decision.reply);
    });
    await t.test("seller can add another product after an offer is saved without reusing the old offer details", async () => {
      reset();
      state.decision = { role: "seller", newIntake: true, fields: { product: "Copper cathode", quantity: 100, price: 5900, currency: "USD" }, reply: "model reply" };
      await message({ text: { body: "I am offering copper cathode, 100 MT at USD 5,900 per MT" } });
      assert.equal(state.recorded.length, 1);
      assert.match(state.sent.at(-1).body, /Would you like to add another product\?/);
      assert.equal(state.saved.draft.awaitingAnotherProduct, true);

      await message({ text: { body: "Yes" } });
      assert.equal(state.sent.at(-1).body, "Sure. What product would you like to offer?");
      assert.deepEqual(state.saved.draft, {});

      state.decision = { role: "seller", newIntake: true, fields: { product: "Apples" }, reply: "What quantity can you supply?" };
      await message({ text: { body: "Apples" } });
      assert.equal(state.intake.at(-1).role, "seller");
      assert.equal(state.intake.at(-1).memory, null);
      assert.deepEqual(state.recorded.map((offer: any) => offer.product), ["copper cathode"]);
      assert.equal(state.sent.at(-1).body, "What quantity can you supply?");
    });
    await t.test("seller can decline to add another product and finish the offer flow", async () => {
      reset();
      state.saved = { role: "seller", draft: { product: "Copper cathode", quantity: 100, price: 5900, submittedRecordId: "offer-1", awaitingAnotherProduct: true }, stale: false };
      await message({ text: { body: "No thanks" } });
      assert.equal(state.sent.at(-1).body, "Okay. I’ll keep this offer with UDC for review.");
      assert.equal(state.saved, null);
      assert.deepEqual(state.intake, []);
    });
    await t.test("natural intake cannot use AI output to cross an existing account's role", async () => {
      for (const [role, requestedRole] of [['buyer','seller'],['seller','buyer'],['agent','buyer'],['agent','seller']]) {
        reset();
        rows.usersTable = [{ id:'qa-identity', phone:'10000000001', role, status:'pending' }];
        state.decision = { role:requestedRole, newIntake:true,
          fields:{ product:'Sugar',quantity:100,price:490,targetPrice:500,destination:'Mombasa' },
          reply:'I will send this for review.' };
        const original = structuredClone(rows.usersTable);
        const text = requestedRole==='seller'?'I can supply 100 MT Sugar at USD 490 per MT.':'I need 100 MT Sugar to Mombasa at USD 500 per MT.';
        assert.equal((await message({text:{body:text}})).status,200);
        assert.deepEqual(state.recorded,[],`${role} must not submit as ${requestedRole}`);
        assert.equal(state.saved,null,'a conflicting model decision must not replace intake memory');
        assert.deepEqual(rows.usersTable,original);
        assert.match(state.sent.at(-1).body,/registered as|account role/i);
      }
    });
    await t.test("pending users can finish intake; suspended users cannot submit", async () => {
      reset(); rows.usersTable = [{ id: "buyer", phone: "10000000001", role: "buyer", status: "pending" }];
      state.decision = { role: "buyer", fields: {}, reply: "Which product do you need?" };
      await message({ text: { body: "What can I buy?" } }); assert.equal(state.intake.length, 1);
      rows.usersTable[0].status = "suspended";
      state.saved = { role: "buyer", draft: { product: "Copper", quantity: 100 }, stale: false };
      await message({ text: { body: "I need copper USD 5900" } }); assert.equal(state.intake.length, 1);
      await message({ image: { id: "private-image", mime_type: "image/png" } });
      assert.deepEqual(state.uploaded, []);
      assert.match(state.sent.at(-1).body, /admin review/);
    });
    await t.test("explicitly separate inquiries use one intake call without old deal or draft memory", async () => {
      reset(); seedDeal();
      state.saved = { role: "buyer", draft: { product: "Sugar", quantity: 999, submittedRecordId: "old-submission" }, stale: false };
      state.decision = { role: "buyer", newIntake: false, fields: { product: "Copper cathode", quantity: 100, targetPrice: 5900, destination: "Jebel Ali", incoterm: "CIF" }, reply: "I’ll send this for UDC review." };
      await message({ text: { body: "New separate test requirement: I need 100 MT copper cathode, target USD 5900 per MT, CIF Jebel Ali." } });
      assert.equal(state.dealCalls, 0); assert.equal(state.intake.length, 1);
      assert.equal(state.intake[0].memory, null);
      assert.equal(state.recorded.length, 1); assert.equal(state.recorded[0].quantity, 100);
      assert.ok(state.sent.every((s: any) => s.to === "10000000001"));
    });
    await t.test("natural complete inquiry preserves CIF and Jebel Ali independently of an old Dubai deal", async () => {
      reset(); seedDeal(); rows.dealsTable[0].destination = "Dubai";
      const body = "I need 100 MT copper cathode, target USD 5,900 per MT, CIF Jebel Ali";
      state.saved = { role: "buyer", draft: { product: "Sugar", quantity: 999, destination: "Dubai", submittedRecordId: "old-submission" }, stale: false };
      state.decision = { role: "buyer", newIntake: false, fields: { product: "Copper cathode", quantity: 100, targetPrice: 5900, currency: "USD", destination: "Jebel Ali", incoterm: "CIF", specification: "Grade A", deliveryTime: "30 days", contractDuration: "12 months", inspectionRequirements: "SGS at destination" }, reply: "I’ll send this for UDC review." };
      await message({ text: { body } });
      assert.equal(state.dealCalls, 0); assert.equal(state.intake[0].memory, null);
      assert.equal(state.recorded[0].destination, "Jebel Ali"); assert.equal(state.recorded[0].incoterm, "CIF");
      assert.equal(state.recorded[0].specification, "Grade A");
      assert.equal(state.recorded[0].deliveryTime, "30 days");

      assert.equal(rows.dealsTable[0].destination, "Dubai", "a fresh inquiry must not amend an old deal");
      state.decision.newIntake = true; // A model classification cannot duplicate an identical submitted inquiry.
      await message({ text: { body } });
      assert.equal(state.dealCalls, 0); assert.equal(state.recorded.length, 1, "repeating the submitted inquiry must not create another record");
      assert.equal(state.intake[1].memory.submittedRecordId, "requirement");
    });
    await t.test("a complete followup preserves an unfinished intake draft", async () => {
      reset(); seedDeal();
      state.saved = { role: "buyer", draft: { product: "Copper", quantity: 100, targetPrice: 5900 }, stale: false };
      state.decision = { role: "buyer", newIntake: false, fields: { destination: "Jebel Ali", incoterm: "CIF" }, reply: "I’ll send this for UDC review." };
      await message({ text: { body: "I need 100 MT copper at USD 5900 CIF Jebel Ali" } });
      assert.equal(state.intake[0].memory.targetPrice, 5900);
      assert.equal(state.recorded[0].quantity, 100); assert.equal(state.recorded[0].destination, "Jebel Ali");
    });
    await t.test("documents require review and explicit access before sharing", async () => {
      reset(); seedDeal();
      rows.documentsTable = [{ id: "doc", dealId: "deal-a", documentType: "FCO", uploadedBy: "seller", status: "pending", fileUrl: "storage://udc-documents/fco.pdf" }];
      await message({ text: { body: "send FCO to me" } }); assert.deepEqual(state.signed, []);
      rows.documentsTable[0].status = "approved";
      await message({ text: { body: "send FCO to me" } }); assert.deepEqual(state.signed, []);
      rows.documentAccessTable = [{ documentId: "doc", userId: "buyer" }];
      await message({ text: { body: "send FCO to me" } }); assert.deepEqual(state.signed, ["fco.pdf"]);
      state.signed = []; rows.usersTable[0].phone = "10000000003";
      await message({ from: "10000000002", text: { body: "deal UDC-A: send FCO to buyer" } });
      assert.deepEqual(state.signed, ["fco.pdf"]);
      state.signed = []; rows.documentAccessTable = [];
      await message({ from: "10000000002", text: { body: "deal UDC-A: send FCO to buyer" } }); assert.deepEqual(state.signed, []);
    });
    await t.test("media replies attach to the quoted deal, with an owner grant", async () => {
      reset(); seedDeal();
      rows.whatsappMessageContextsTable = [{ providerMessageId: "quoted-b", dealId: "deal-b", recipientUserId: "buyer" }];
      await message({ context: { id: "quoted-b" }, document: { id: "media", filename: "LOI.pdf" } });
      assert.equal(rows.documentsTable[0]?.dealId, "deal-b");
      assert.equal(rows.documentAccessTable[0]?.userId, "buyer");
      assert.equal(rows.documentAccessTable[0]?.documentId, rows.documentsTable[0]?.id);
    });
    await t.test("unknown or revoked quoted context cannot fall back to another deal", async () => {
      reset(); seedDeal();
      await message({ context: { id: "unknown" }, document: { id: "media" } }); assert.deepEqual(state.uploaded, []);
      await message({ context: { id: "unknown" }, text: { body: "yes" } }); assert.deepEqual(state.intake, []);
      rows.whatsappMessageContextsTable = [{ providerMessageId: "revoked", dealId: "deal-b", recipientUserId: "buyer" }];
      rows.dealParticipantsTable = rows.dealParticipantsTable.filter(r => r.dealId !== "deal-b");
      await message({ context: { id: "revoked" }, document: { id: "media" } }); assert.deepEqual(state.uploaded, []);
    });
    await t.test("provider retry of a document cannot upload it twice", async () => {
      reset(); seedDeal();
      const fields = { id: "same-id", document: { id: "media", filename: "LOI.pdf" } };
      await message(fields); await message(fields);
      assert.equal(state.uploaded.length, 1); assert.equal(rows.documentsTable.length, 1);
    });
    await t.test("draft generation requires a quoted confirmation bound to current terms", async () => {
      reset(); seedDeal();
      await message({ text: { body: "prepare LOI draft" } });
      assert.deepEqual(state.uploaded, []); assert.match(state.sent.at(-1).body, /CONFIRM DRAFT LOI/);
      const preview = rows.whatsappMessageContextsTable.find(r => r.kind.startsWith("draft_confirmation:"));
      assert.ok(preview);
      // A typed confirmation without quoting the preview cannot bypass it.
      await message({ text: { body: "CONFIRM DRAFT LOI" } }); assert.deepEqual(state.uploaded, []);
      rows.dealsTable[0].agreedPrice = "6000";
      await message({ context: { id: preview.providerMessageId }, text: { body: "CONFIRM DRAFT LOI" } });
      assert.deepEqual(state.uploaded, []); assert.match(state.sent.at(-1).body, /6,000/);
      const refreshed = rows.whatsappMessageContextsTable.filter(r => r.kind.startsWith("draft_confirmation:")).at(-1);
      await message({ context: { id: refreshed.providerMessageId }, text: { body: "CONFIRM DRAFT LOI" } });
      assert.equal(state.uploaded.length, 1);
      assert.match(state.uploaded[0], /LOI\.txt$/);
      assert.equal(rows.documentsTable[0].status, "pending");
      assert.equal(rows.documentAccessTable[0].userId, "buyer");
      assert.equal(rows.auditLogsTable[0].action, "loi_draft_generated");
      assert.ok(state.sent.every((s: any) => s.to === "10000000001"));
      assert.match(state.sent.at(-1).body, /private draft for review/);
    });
    await t.test("seller cannot generate buyer documents and meetings reach admin review history", async () => {
      reset(); seedDeal();
      await message({ from: "10000000002", text: { body: "deal UDC-A: prepare LOI draft" } });
      assert.deepEqual(state.uploaded, []); assert.match(state.sent.at(-1).body, /authorized party/);
      state.dealDecision = { intent: "meeting_request", replyToSender: "I’ll ask UDC to arrange a call.", relay: false, relayToCounterparty: null };
      await message({ text: { body: "Can we arrange a video call?" } });
      assert.equal(rows.dealConversationEventsTable.filter(r => r.intent === "meeting_request").length, 1);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await unlink(output); delete (globalThis as any).__whatsappRoutes;
    if (oldSecret === undefined) delete process.env.WHATSAPP_APP_SECRET; else process.env.WHATSAPP_APP_SECRET = oldSecret;
  }
});
