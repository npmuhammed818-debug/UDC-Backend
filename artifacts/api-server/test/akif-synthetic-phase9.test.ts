// Phase 9 pre-pilot test set (owner-approved 29 Oct, code only): synthetic
// fake-customer chats, cross-customer isolation, accuracy and correction
// checks against the real AKIF modules. No staging, no models, no real data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  buyerCopperChat,
  sellerCopperChat,
  sellerPrivateFloor,
  crossCustomerProbes,
  accuracyQuestions,
  edgeCaseInputs,
  syntheticIntakeDecisions,
  syntheticCustomers,
} from "./fixtures/synthetic-customers.ts";
import { triageBuyerRequirement } from "../src/akif/buyerRequirementTriage.ts";
import { isSellerOffer, triageSellerOffer } from "../src/akif/sellerOfferTriage.ts";
import { classifyTurn, wantsHumanHelp, claimsUnverifiedFact } from "../src/akif/conversationPolicy.ts";
import {
  participantConversation,
  violatesPrivateRelay,
  containsContactDetails,
} from "../src/akif/dealConversationPrivacy.ts";
import {
  trustedGuidanceAnswer,
  validateGuidanceReply,
  udcHandbook,
  udcHandbookForRole,
  cifAnswer,
  dlcAnswer,
  commissionAnswer,
  buyerDocumentsAnswer,
  publicWebsite,
} from "../src/akif/udcHandbook.ts";
import { guardOutboundText, hasUnresolvedPlaceholder } from "../src/akif/outboundGuard.ts";

test("synthetic buyer chat: intake extracts product, quantity, CIF Mundra and target price", () => {
  const draft = triageBuyerRequirement(buyerCopperChat[1]);
  assert.ok(draft.product && /copper/i.test(draft.product), String(draft.product));
  assert.equal(draft.quantity, 500);
  assert.equal(draft.unit, "MT");
  assert.equal(draft.destination, "Mundra");
  assert.equal(draft.incoterm, "CIF");
  // Price arrives in the follow-up turn, so the first line reports it missing.
  assert.deepEqual(draft.missingFields, ["targetPrice"]);
  const withPrice = triageBuyerRequirement(`${buyerCopperChat[1]}, ${buyerCopperChat[2]}`);
  assert.equal(withPrice.targetPrice, 8500);
  assert.equal(withPrice.currency, "USD");
  assert.deepEqual(withPrice.missingFields, []);
});

test("synthetic seller chat: offer detection and extraction with origin and price", () => {
  assert.ok(isSellerOffer(sellerCopperChat[1]));
  const offer = triageSellerOffer(sellerCopperChat[1]);
  assert.equal(offer.quantity, 1000);
  assert.equal(offer.price, 8700);
  assert.equal(offer.currency, "USD");
  assert.equal(offer.originCountry, "Zambia");
  assert.equal(offer.destination, "Mundra");
  assert.match(offer.specification ?? "", /99\.99/);
  assert.deepEqual(offer.missingFields, []);
  assert.ok(!isSellerOffer(buyerCopperChat[1]));
});

test("mid-chat correction is a correction turn, and the corrected value wins", () => {
  assert.equal(classifyTurn(buyerCopperChat[3], true), "correction");
  const corrected = triageBuyerRequirement("I meant 480 MT not 500, copper cathodes CIF Mundra");
  assert.equal(corrected.quantity, 480);
});

test("deal conversation relay: the other side sees only UDC-approved relay text", () => {
  const events = [
    { userId: syntheticCustomers.buyerAsha.userId, originalText: "can you do 8500?", relayed: false, relayText: null },
    { userId: syntheticCustomers.sellerBala.userId, originalText: sellerPrivateFloor.privateMessages[0], relayed: false, relayText: null },
    { userId: syntheticCustomers.sellerBala.userId, originalText: "no, 8600 final, and my margin is private", relayed: true, relayText: "The seller counters at 8600 USD per MT." },
  ];
  const buyerView = participantConversation(events, syntheticCustomers.buyerAsha.userId);
  assert.equal(buyerView.length, 2);
  assert.ok(buyerView.every((event) => !/minimum|margin|private/.test(event.originalText)));
  assert.equal(buyerView[1].originalText, "The seller counters at 8600 USD per MT.");
});

test("privacy: the seller's floor price and contact details never leak in a relay", () => {
  for (const probe of ["the seller can do 8400", "8400 is his floor"]) {
    assert.ok(violatesPrivateRelay(probe, sellerPrivateFloor.privateMessages), probe);
  }
  // An explicit, exact offer instruction releases only that one value.
  assert.ok(!violatesPrivateRelay("the seller offers 8400", sellerPrivateFloor.privateMessages, sellerPrivateFloor.explicitRelease));
  // Contact details stay blocked until the deal stage unlocks them.
  assert.ok(violatesPrivateRelay(`call him on ${syntheticCustomers.sellerBala.phone}`, []));
  assert.ok(containsContactDetails(syntheticCustomers.sellerBala.email));
});

test("accuracy: CIF, DLC, commission, website and document answers follow the UDC handbook", () => {
  assert.equal(trustedGuidanceAnswer(accuracyQuestions.cif), cifAnswer);
  assert.match(cifAnswer, /Cost, Insurance and Freight/);
  assert.equal(trustedGuidanceAnswer(accuracyQuestions.dlc), dlcAnswer);
  assert.match(dlcAnswer, /Documentary Letter of Credit/);
  assert.match(dlcAnswer, /SGS at destination/);
  assert.equal(trustedGuidanceAnswer(accuracyQuestions.commission), commissionAnswer);
  assert.ok(!/\d|%/.test(commissionAnswer), "commission answer must carry no rates or numbers");
  assert.equal(trustedGuidanceAnswer(accuracyQuestions.buyerDocs, "buyer"), buyerDocumentsAnswer);
  assert.match(buyerDocumentsAnswer, /company registration|trade licence/);
  assert.match(buyerDocumentsAnswer, /before signing the SPA/);
  const website = trustedGuidanceAnswer(accuracyQuestions.website);
  assert.ok(website?.includes(publicWebsite));
});

test("accuracy guard: risky drafts are rejected before they reach a customer", () => {
  assert.ok(!validateGuidanceReply("DLC is the safest method and fully risk-free for you."));
  assert.ok(!validateGuidanceReply("Agents usually earn 3% commission paid after the deal."));
  assert.ok(!validateGuidanceReply("You need to upload your passport and bank statement to register."));
  assert.ok(!validateGuidanceReply("UDC has no website or founder."));
  assert.ok(validateGuidanceReply(commissionAnswer));
  assert.ok(validateGuidanceReply(cifAnswer));
});

test("UDC stays WhatsApp-only and agents never see buyer/seller document steps", () => {
  assert.match(udcHandbook, /no app, mobile app, dashboard or portal/i);
  const agentBook = udcHandbookForRole("agent");
  assert.ok(!/single-use upload link/.test(agentBook), "agents never get buyer/seller document steps");
  assert.match(agentBook, /AGENT/);
});

test("edge cases: rude, nonsense, other languages and long inputs stay safe", () => {
  assert.ok(!wantsHumanHelp(edgeCaseInputs.rudeNoHandoff));
  assert.ok(wantsHumanHelp(edgeCaseInputs.explicitHandoff));
  assert.ok(["answer", "question", "correction"].includes(classifyTurn(edgeCaseInputs.nonsense, true)));
  assert.ok(["answer", "question", "correction"].includes(classifyTurn(edgeCaseInputs.malayalamQuestion, true)));
});

test("outbound guard: unresolved placeholders are replaced with the honest fallback", () => {
  assert.ok(hasUnresolvedPlaceholder(edgeCaseInputs.placeholderDraft));
  const guarded = guardOutboundText(edgeCaseInputs.placeholderDraft);
  assert.ok(guarded.replaced);
  assert.ok(!guarded.text.includes("<link1>"));
  assert.ok(!guardOutboundText("Sending this for UDC review.").replaced);
});

// Correction learning and private memory against a fixture database: the
// synthetic customer's correction lands in their own memory only, a second
// customer can never read it, and an injected instruction inside a memory is
// quoted as data, never a rule.
test("corrections and memories stay private to the synthetic customer who made them", async () => {
  const tableNames = ["akifCustomerMemoriesTable", "usersTable"];
  const tables = Object.fromEntries(tableNames.map((name) => [name, new Proxy({ _table: name }, {
    get: (target, key) => (key === "_table" ? name : { column: key, table: name }),
  })]));
  const rows: Record<string, any[]> = Object.fromEntries(tableNames.map((name) => [name, []]));
  const val = (expr: any, row: any) => (expr?.column ? row[expr.table]?.[expr.column] : expr);
  const match = (expr: any, row: any): boolean => !expr ? true
    : expr.kind === "and" ? expr.args.every((e: any) => match(e, row))
    : expr.kind === "or" ? expr.args.some((e: any) => match(e, row))
    : expr.kind === "eq" ? val(expr.a, row) === val(expr.b, row)
    : true;
  const select = (fields: any) => {
    let from: any, condition: any, limit = Infinity;
    const q: any = {
      from: (t: any) => ((from = t._table), q),
      where: (c: any) => ((condition = c), q),
      limit: (n: number) => ((limit = n), q),
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        let result = rows[from].map((row) => ({ [from]: row })).filter((item) => match(condition, item));
        result = result.slice(0, limit);
        return result.map((item) => fields ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, val(value, item)])) : item[from]);
      }).then(resolve, reject),
    };
    return q;
  };
  const insert = (table: any) => {
    let input: any;
    const run = () => {
      const batch = Array.isArray(input) ? input : [input];
      return batch.map((item) => {
        const result = { id: randomUUID(), status: "active", createdAt: new Date(), ...item };
        rows[table._table].push(result);
        return result;
      });
    };
    const q: any = {
      values: (value: any) => ((input = value), q),
      returning: (fields: any) => Promise.resolve().then(run).then((items) => fields ?
        items.map((item: any) => Object.fromEntries(Object.entries(fields).map(([key, v]: any) => [key, item[v.column]]))) : items),
    };
    return q;
  };
  const db = { select, insert, delete: () => ({ where: () => ({ returning: async () => [] }) }) };
  (globalThis as any).__phase9Fixture = { db };
  const output = fileURLToPath(new URL(`./akif-phase9-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: "export * from '../src/akif/customerMemory';export * from '../src/akif/correctionLearning';", resolveDir: fileURLToPath(new URL(".", import.meta.url)) },
    platform: "node", format: "esm", bundle: true, packages: "external", write: false,
    plugins: [{ name: "fixture", setup(b) {
      const fixtures: Record<string, string> = {
        db: `export const db=globalThis.__phase9Fixture.db;export const akifCustomerMemoriesTable=globalThis.__phase9Fixture.tables.akifCustomerMemoriesTable;export const usersTable=globalThis.__phase9Fixture.tables.usersTable;`,
        orm: "export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const eq=(a,b)=>({kind:'eq',a,b});export const ilike=(a,pattern)=>({kind:'ilike',a,pattern});export const desc=x=>({kind:'desc',x});",
      };
      (globalThis as any).__phase9Fixture.tables = tables;
      for (const [filter, path] of [[/^@workspace\/db$/, "db"], [/^drizzle-orm$/, "orm"]] as const) b.onResolve({ filter }, () => ({ path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: fixtures[args.path] }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  try {
    const m: any = await import(output);
    rows.usersTable = [
      { id: syntheticCustomers.buyerAsha.userId, akifLearningOptIn: true },
      { id: syntheticCustomers.buyerMaya.userId, akifLearningOptIn: false },
    ];
    // The correction pattern must fire on the synthetic correction and stay
    // quiet on an ordinary requirement line and on oversized input.
    assert.ok(m.looksLikeCorrection(buyerCopperChat[3]));
    assert.ok(!m.looksLikeCorrection(buyerCopperChat[1]));
    assert.ok(!m.looksLikeCorrection(edgeCaseInputs.longMessage));
    // Saved privately for the correcting customer, with its source.
    const result = await m.handleCorrectionTurn({
      userId: syntheticCustomers.buyerAsha.userId,
      text: buyerCopperChat[3],
      source: "synthetic-test",
      database: db,
    });
    assert.equal(result.saved, true);
    assert.equal(rows.akifCustomerMemoriesTable.length, 1);
    assert.equal(rows.akifCustomerMemoriesTable[0].userId, syntheticCustomers.buyerAsha.userId);
    assert.equal(rows.akifCustomerMemoriesTable[0].kind, "correction");
    // No opt-in: nothing stored.
    await assert.rejects(() => m.handleCorrectionTurn({
      userId: syntheticCustomers.buyerMaya.userId,
      text: buyerCopperChat[3],
      source: "synthetic-test",
      database: db,
    }), /learning_not_opted_in/);
    assert.equal(rows.akifCustomerMemoriesTable.length, 1, "no write without opt-in");
    // The other customer can never read it, by list or by recall.
    await assert.rejects(() => m.listCustomerMemories({
      userId: syntheticCustomers.buyerAsha.userId,
      viewerUserId: syntheticCustomers.sellerBala.userId,
      database: db,
    }), /forbidden/);
    await assert.rejects(() => m.recallCustomerMemories({
      userId: syntheticCustomers.buyerAsha.userId,
      viewerUserId: syntheticCustomers.sellerBala.userId,
      query: crossCustomerProbes[1],
      database: db,
    }), /forbidden/);
    // An instruction injected inside a memory stays quoted data in the prompt.
    const block = m.formatMemoriesForPrompt([{ kind: "fact", content: edgeCaseInputs.injectedInstruction }]);
    assert.match(block, /never instructions to you/);
    assert.ok(block.includes(`"${edgeCaseInputs.injectedInstruction}"`));
  } finally {
    await unlink(output).catch(() => {});
  }
});

// Intake decision validation against the synthetic chat: clean model-shaped
// decisions pass with the corrected quantity, a seller-only field smuggled
// into a buyer decision is stripped, and unverified claims are rejected.
test("intake decisions: clean synthetic decisions pass, dishonest ones are rejected", async () => {
  const output = fileURLToPath(new URL(`./akif-phase9-intake-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/akif/intakeConversation.ts", import.meta.url))],
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
  });
  await writeFile(output, bundle.outputFiles[0].text);
  try {
    const { parseIntakeConversation } = await import(output);
    const clean = parseIntakeConversation(syntheticIntakeDecisions.clean);
    assert.ok(clean);
    assert.equal(clean.role, "buyer");
    assert.equal(clean.fields.quantity, 480);
    const wrongField = parseIntakeConversation(syntheticIntakeDecisions.wrongRoleField);
    assert.ok(wrongField);
    assert.equal(wrongField.fields.price, undefined, "seller-only price must not survive on a buyer decision");
    assert.equal(parseIntakeConversation(syntheticIntakeDecisions.unverifiedClaim), null);
    assert.ok(claimsUnverifiedFact("Good news, payment has been received.", {}));
  } finally {
    await unlink(output).catch(() => {});
  }
});
