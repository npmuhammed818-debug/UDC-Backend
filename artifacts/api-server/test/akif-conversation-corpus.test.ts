import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { randomUUID, createHmac } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Real signed webhook, agents, normalizer and Hermes HTTP client; simulated
// persistence, model responses and WhatsApp delivery. Never sends live messages.
test("buyer intake → UDC → seller → UDC → buyer with memory and selective delivery", async () => {
  const s: any = {
    tables: {},
    sent: [],
    prompts: [],
    responses: [],
    records: [],
    active: false,
    deal: {
      id: "deal-1",
      buyerUserId: "buyer",
      sellerUserId: "seller",
      status: "negotiation",
      quantity: "50",
      unit: "MT",
      agreedPrice: "7900",
      currency: "USD",
      destination: "Dubai",
    },
  };
  const names = [
    "usersTable",
    "dealConversationEventsTable",
    "dealParticipantsTable",
    "dealsTable",
    "documentsTable",
    "whatsappMessageContextsTable",
    "whatsappUserContextsTable",
    "whatsappIntakeDraftsTable",
  ];
  names.forEach((n) => (s.tables[n] = []));
  s.tables.usersTable = ["buyer", "seller"].map((role, i) => ({
    id: role,
    role,
    status: "verified",
    phone: i ? "222222222" : "111111111",
  }));
  s.db = {
    select(selection?: any) {
      let rows: any[] = [];
      const q: any = {
        from(t: any) {
          rows = [...s.tables[t._name]];
          return q;
        },
        where(p: any) {
          rows = rows.filter(p);
          return q;
        },
        innerJoin() {
          rows = s.active
            ? s.tables.dealParticipantsTable.map((p: any) => ({
                ...s.deal,
                ...p,
              }))
            : [];
          return q;
        },
        orderBy() {
          return q;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return q;
        },
        then(ok: any, bad: any) {
          return Promise.resolve(
            selection
              ? rows.map((r) =>
                  Object.fromEntries(
                    Object.entries(selection).map(([k, c]: any) => [
                      k,
                      r[c.key],
                    ]),
                  ),
                )
              : rows,
          ).then(ok, bad);
        },
      };
      return q;
    },
    insert(t: any) {
      let v: any,
        duplicate = false;
      const q: any = {
        values(x: any) {
          v = { id: randomUUID(), createdAt: new Date(), ...x };
          return q;
        },
        onConflictDoNothing() {
          duplicate = s.tables[t._name].some(
            (x: any) =>
              v.providerMessageId &&
              x.providerMessageId === v.providerMessageId,
          );
          return q;
        },
        onConflictDoUpdate() {
          const k =
            t._name === "whatsappIntakeDraftsTable" ? "phone" : "userId";
          s.tables[t._name] = s.tables[t._name].filter(
            (x: any) => x[k] !== v[k],
          );
          return q;
        },
        returning() {
          return q;
        },
        then(ok: any, bad: any) {
          if (!duplicate) s.tables[t._name].push(v);
          return Promise.resolve(duplicate ? [] : [v]).then(ok, bad);
        },
      };
      return q;
    },
    update(t: any) {
      return {
        set(v: any) {
          return {
            async where(p: any) {
              s.tables[t._name]
                .filter(p)
                .forEach((r: any) => Object.assign(r, v));
            },
          };
        },
      };
    },
  };
  (globalThis as any).__udcChatTest = s;
  const stubs: Record<string, string> = {
    "@workspace/db": `export const db=globalThis.__udcChatTest.db;${names.map((n) => `export const ${n}=new Proxy({_name:'${n}'},{get:(t,k)=>k==='_name'?t._name:{key:k}});`).join("")}`,
    "drizzle-orm":
      "export const eq=(c,v)=>r=>r[c.key]===v;export const and=(...ps)=>r=>ps.every(p=>p(r));export const desc=x=>x;",
    "../auth/middleware": "export const requireRole=()=>()=>{};",
    "../akif/queueResearch":
      "export const queueWhatsAppResearch=async()=>null;",
    "../akif/documentIntelligence":
      "export const processDocumentIntelligence=async()=>{};",
    "../supabase/storage":
      "export const createSignedDownloadUrl=async()=>'';export const parseStoragePath=()=>null;export const uploadDocumentBytes=async()=>({});",
    "../whatsapp/client":
      "const s=globalThis.__udcChatTest;export const sendWhatsAppText=async(to,body)=>{const id='out-'+s.sent.length;s.sent.push({to,body,id});return {delivered:true,messageId:id}};export const sendWhatsAppDocument=async()=>({delivered:false});export const downloadWhatsAppMedia=async()=>null;",
    "../akif/recordBuyerRequirement":
      "export const recordPendingBuyerRequirement=async(v)=>{globalThis.__udcChatTest.records.push(v);return {id:'requirement-1',status:'pending_admin_review'}};",
    "../akif/recordPendingSellerOffer":
      "export const recordPendingSellerOffer=async()=>({id:'offer-1'});",
    "./intelligence/dealContext":
      "export const getAkifDealContext=async()=>{const s=globalThis.__udcChatTest;return {deal:s.deal,product:{name:'Copper'},conversation:s.tables.dealConversationEventsTable,buyerRequest:{destination:'Dubai'},documents:[]}};",
  };
  const output = fileURLToPath(
    new URL(`../.chat-test-${randomUUID()}.mjs`, import.meta.url),
  );
  const bundle = await build({
    entryPoints: [
      fileURLToPath(
        new URL("../src/routes/whatsappWebhook.ts", import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "fixtures",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) =>
            a.path in stubs
              ? { path: a.path, namespace: "fixture" }
              : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents: stubs[a.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  const oldFetch = globalThis.fetch;
  const oldEnv = Object.fromEntries(
    ["HERMES_AKIF_URL", "HERMES_AKIF_API_KEY", "WHATSAPP_APP_SECRET"].map(
      (k) => [k, process.env[k]],
    ),
  );
  Object.assign(process.env, {
    HERMES_AKIF_URL: "https://hermes.invalid",
    HERMES_AKIF_API_KEY: "test-key",
    WHATSAPP_APP_SECRET: "test-secret",
  });
  globalThis.fetch = async (_url, init) => {
    s.prompts.push(JSON.parse(String(init?.body)));
    assert.ok(s.responses.length, "unexpected model call");
    const r = s.responses.shift();
    return Response.json({
      choices: [
        { message: { content: typeof r === "string" ? r : JSON.stringify(r) } },
      ],
    });
  };
  try {
    await writeFile(output, bundle.outputFiles[0].text);
    const router = (await import(output)).default;
    const handler = router.stack.find(
      (l: any) =>
        l.route?.path === "/webhooks/whatsapp" && l.route.methods.post,
    ).route.stack[0].handle;
    let seq = 0;
    async function send(
      from: string,
      body: string,
      response: any,
      replyTo?: string,
      id = `in-${seq++}`,
    ) {
      if (response !== undefined) s.responses.push(response);
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from,
                      id,
                      text: { body },
                      ...(replyTo ? { context: { id: replyTo } } : {}),
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      let status;
      await handler(
        {
          body: payload,
          rawBody,
          header: () =>
            `sha256=${createHmac("sha256", "test-secret").update(rawBody).digest("hex")}`,
          log: { info() {}, error() {} },
        },
        {
          sendStatus(n: number) {
            status = n;
          },
        },
      );
      assert.equal(status, 200);
    }
    const intake = (fields: any, reply: string) => ({
      role: "buyer",
      fields,
      newIntake: false,
      reply,
    });
    await send(
      "111111111",
      "I need copper 50mt",
      intake(
        { product: "Copper", quantity: 50, unit: "MT" },
        "What price are you targeting?",
      ),
    );
    await send(
      "111111111",
      "7900usd",
      intake({ targetPrice: 7900, currency: "USD" }, "Where should it go?"),
    );
    await send(
      "111111111",
      "Dubai",
      intake(
        { destination: "Dubai" },
        "I’ll put the 50 MT requirement through for review.",
      ),
    );
    await send(
      "111111111",
      "I already said Dubai right",
      intake({}, "Yes, I have Dubai."),
    );
    assert.equal(s.records.length, 1, "do not create completed intake again");
    assert.equal(s.records[0].targetPrice, 7900);
    const memory = JSON.parse(s.prompts.at(-1).messages[1].content).memory;
    assert.equal(memory.destination, "Dubai");
    assert.equal(memory.submittedRecordId, "requirement-1");
    assert.ok(memory.conversation.length);
    assert.ok(s.sent.every((m: any) => m.to === "111111111"));
    s.active = true;
    s.tables.dealsTable.push(s.deal);
    s.tables.dealParticipantsTable.push(
      ...["buyer", "seller"].map((userId) => ({
        dealId: "deal-1",
        userId,
        status: "active",
      })),
    );
    const decision = (
      intent: string,
      replyToSender: string,
      relayToCounterparty: string | null = null,
    ) => ({
      intent,
      replyToSender,
      relay: Boolean(relayToCounterparty),
      relayToCounterparty,
      newTradeIntake: false,
    });
    const before = s.sent.length;
    await send(
      "111111111",
      "Can seller do $7,800? Keep my $7,900 maximum private",
      decision(
        "counteroffer",
        "I’ll check $7,800.",
        "Can you do $7,800 per MT for the 50 MT to Dubai?",
      ),
    );
    const offer = s.sent[before];
    assert.equal(offer.to, "222222222");
    assert.doesNotMatch(offer.body, /7,900|maximum|private/);
    await send(
      "222222222",
      "Yes",
      decision(
        "acceptance",
        "Thanks, I’ll take that forward.",
        "$7,800 per MT works for the 50 MT to Dubai.",
      ),
      offer.id,
    );
    assert.equal(
      s.deal.agreedPrice,
      "7800",
      "accept only relayed offer, never private maximum",
    );
    assert.equal(s.sent.at(-2).to, "111111111");
    const turn = JSON.parse(s.prompts.at(-1).messages[1].content);
    assert.equal(turn.participantRole, "seller");
    assert.equal(turn.deal.destination, "Dubai");
    assert.ok(
      turn.recentConversation.some(
        (e: any) => e.intent === "coordinator_reply",
      ),
    );
    assert.match(
      s.prompts.at(-1).messages[0].content,
      /DLC issued directly to the seller.*after SGS inspection at destination/,
    );
    const count = s.sent.length;
    await send(
      "111111111",
      "what is DLC?",
      decision(
        "deal_question",
        "DLC goes directly to the seller, with payment after SGS at destination.",
      ),
    );
    assert.equal(s.sent.length, count + 1, "education must not bother seller");
    await send(
      "111111111",
      "hi",
      decision("casual", "Hey, how can I help?"),
      undefined,
      "duplicate",
    );
    const once = s.sent.length;
    await send("111111111", "hi", undefined, undefined, "duplicate");
    assert.equal(s.sent.length, once, "do not send twice on retries");
    s.deal.status = "shipping";
    await send(
      "111111111",
      "Where are we?",
      decision(
        "status_question",
        "We’re at shipping; I don’t have a fresh arrival update yet.",
      ),
    );
    assert.match(s.sent.at(-1).body, /fresh arrival/);
    const failed = s.sent.length;
    await send("111111111", "Please ask about arrival", "Rate limit exceeded");
    assert.equal(s.sent.length, failed + 1);
    assert.match(s.sent.at(-1).body, /didn’t pass/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [k, v] of Object.entries(oldEnv))
      v === undefined ? delete process.env[k] : (process.env[k] = v);
    delete (globalThis as any).__udcChatTest;
    await unlink(output).catch(() => {});
  }
});
