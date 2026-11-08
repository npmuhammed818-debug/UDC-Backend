// Isolated loopback QA DB only (udc_qa_brainorchestrator_*), synthetic data, no network.
// Brain-orchestrator proof: the Groq tool-calling front door runs AKIF features
// through tools with the same validators and review gates, and unsafe model
// output is rejected to the scripted fallback.
//   UDC_BRAINORCH_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_brainorchestrator_x?sslmode=disable' node .../brain-orchestrator-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_BRAINORCH_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_brainorchestrator_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|GROQ_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  SUPABASE_DATABASE_URL: url.href,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  NODE_ENV: "test",
  WHATSAPP_APP_SECRET: "synthetic-brainorchestrator-secret-32",
  AKIF_BRAIN_ORCHESTRATOR: "on",
  GROQ_API_KEY: "synthetic-offline-key",
});
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-brainorchestrator-", import.meta.url)));
let pool;
let checks = 0;
const pass = (l) => { checks++; console.log("PASSED: " + l); };
try {
  await build({
    stdin: {
      contents: `export { runBrainTurn, isBrainOrchestratorEnabled, BRAIN_TOOLS } from './src/akif/brainOrchestrator.ts';export { pool, db, usersTable, companiesTable, auditLogsTable, whatsappChatSessionsTable, buyerRequestsTable, dealsTable, productsTable } from '@workspace/db';export { eq, sql } from 'drizzle-orm';export { readSunkReplies } from './src/whatsapp/replySink.ts';`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native", "@resvg/resvg-js"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
  const { runBrainTurn, isBrainOrchestratorEnabled, BRAIN_TOOLS } = app;
  const { db, usersTable, companiesTable, auditLogsTable, whatsappChatSessionsTable, buyerRequestsTable, dealsTable, productsTable, eq, sql } = app;
  const { readSunkReplies } = app;

  assert.ok(isBrainOrchestratorEnabled(), "flag on");
  pass("orchestrator env flag reads on");

  // Fake Groq: scripted by the test; never any network.
  const toolCall = (name, args, id = "call_" + Math.random().toString(36).slice(2, 8)) => ({ id, name, argumentsJson: JSON.stringify(args) });
  const phone = "+1555000111";

  // Turn 1: plain chat, no tools.
  let chat = async () => ({ content: "Hi! I am Akif. What would you like to trade?", toolCalls: [] });
  let out = await runBrainTurn({ phone, text: "hello", messageId: "m1" }, chat);
  assert.equal(out?.handled, true);
  assert.match(out.reply, /Akif/);
  pass("plain chat turn replies in the brain's own words");

  // Turn 2: seller intent -> model saves registration details via tool.
  const seenMessages = [];
  chat = async (messages) => {
    seenMessages.push(messages);
    const hasToolResult = messages.some((m) => m.role === "tool");
    if (!hasToolResult) return { content: null, toolCalls: [toolCall("save_registration_details", { role: "seller", full_name: "Test Seller" })] };
    return { content: "Thanks! What email should UDC use for your account?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "I am Test Seller, I want to sell cardamom", messageId: "m2" }, chat);
  assert.equal(out?.handled, true);
  let [session] = await db.select().from(whatsappChatSessionsTable).where(sql`${whatsappChatSessionsTable.purpose} = 'brain_orchestrator'`).limit(1);
  assert.equal(session?.data?.brain?.fields?.full_name, "Test Seller");
  pass("save_registration_details tool validates and stores fields in the brain session");

  // Turn 3: remaining details -> submit -> real registration row, pending review.
  chat = async (messages) => {
    const toolResults = messages.filter((m) => m.role === "tool").length;
    if (toolResults === 0) return { content: null, toolCalls: [toolCall("save_registration_details", { role: "seller", email: "seller@testcompany.example", company_name: "TestCo Spices Ltd", country: "India" })] };
    if (toolResults === 1) return { content: null, toolCalls: [toolCall("submit_registration", { role: "seller" })] };
    return { content: "You are registered and sent for UDC review. I emailed you a 6-digit code to confirm your email.", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "email seller@testcompany.example, company TestCo Spices Ltd, India. Submit it.", messageId: "m3" }, chat);
  assert.equal(out?.handled, true);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  assert.ok(user, "user row created");
  assert.equal(user.role, "seller");
  assert.equal(user.status, "pending");
  assert.equal(user.email, "seller@testcompany.example");
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId, user.id)).limit(1);
  assert.equal(company?.companyName, "TestCo Spices Ltd");
  assert.equal(company?.verificationStatus, "pending");
  const audits = await db.select().from(auditLogsTable).where(sql`${auditLogsTable.action} = 'whatsapp_brain_registration_saved'`);
  assert.equal(audits.length, 1);
  [session] = await db.select().from(whatsappChatSessionsTable).where(sql`${whatsappChatSessionsTable.purpose} = 'brain_orchestrator'`).limit(1);
  assert.deepEqual(session?.data?.brain?.fields, {}, "fields cleared after submit");
  pass("brain-led registration persists with pending review, company pending, audit entry");

  // Turn 4: free-email rejection for a seller (validator inside the tool).
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("save_registration_details", { role: "seller", email: "seller@gmail.com" })] };
    assert.match(tool.content, /company email/i, "validator rejection is reported back to the model");
    return { content: "Sellers need a company email, not Gmail. What is your company email?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "use seller@gmail.com", messageId: "m4" }, chat);
  assert.equal(out?.handled, true);
  pass("business-email validator rejects free email inside the tool and the model adapts");

  // Turn 5: unsafe model output (unverified fact claim) is rejected to fallback.
  chat = async () => ({ content: "Payment has been received and the inspection passed.", toolCalls: [] });
  out = await runBrainTurn({ phone, text: "is my payment approved?", messageId: "m5" }, chat);
  assert.equal(out, null, "unverified fact claim rejected");
  pass("validator rejects model claims of payment/deal approval; scripted chain takes over");

  // Turn 6: submit_requirement with a seller account -> model is told registration role blocks it.
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("submit_requirement", {})] };
    assert.match(tool.content, /registration/i);
    return { content: "Your account is a seller account; a buyer requirement needs a buyer registration.", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "submit my requirement", messageId: "m6" }, chat);
  assert.equal(out?.handled, true);
  const reqs = await db.select().from(buyerRequestsTable);
  assert.equal(reqs.length, 0, "no requirement row from a seller account");
  pass("role gate: seller account cannot submit a buyer requirement through the tool");

  // Turn 7: unknown/unchecked - model emits no text and no tools -> orchestrator throws -> null.
  chat = async () => { throw new Error("provider down"); };
  out = await runBrainTurn({ phone, text: "any question", messageId: "m7" }, chat).catch(() => null);
  assert.equal(out, null);
  pass("provider failure returns null so the scripted chain runs unchanged");

  // Turn 8 (owner rule): the word "menu" may be surfaced exactly once, at the
  // very start of a conversation; the session locks it afterwards.
  const menuPhone = "+1555000222";
  let systemSeen = "";
  chat = async (messages) => {
    systemSeen = messages.find((m) => m.role === "system")?.content ?? "";
    return { content: "Hi! I am Akif, UDC's trade assistant. You can send the word menu anytime to see every option. What do you trade?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: menuPhone, text: "hi", messageId: "m8" }, chat);
  assert.equal(out?.handled, true);
  assert.match(systemSeen, /you may mention ONCE/, "first turn allows the one-time menu mention");
  [session] = await db.select().from(whatsappChatSessionsTable).where(sql`${whatsappChatSessionsTable.purpose} = 'brain_orchestrator'`).orderBy(sql`${whatsappChatSessionsTable.updatedAt} DESC`).limit(1);
  assert.equal(session?.data?.brain?.menuMentioned, true, "menu mention locks the session flag");
  pass("menu-once: first turn may mention the menu once; the session locks it");

  // Turn 9: next turn on the same session forbids any further menu mention.
  chat = async (messages) => {
    systemSeen = messages.find((m) => m.role === "system")?.content ?? "";
    return { content: "Sure - tell me what you want to buy.", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: menuPhone, text: "cardamom", messageId: "m9" }, chat);
  assert.equal(out?.handled, true);
  assert.match(systemSeen, /NEVER mention, push or repeat the menu again/, "later turns forbid the menu");
  pass("menu-once: later turns forbid any menu mention");

  // Turn 9b: the model disobeys the soft prompt rule and mentions the menu again anyway;
  // hard enforcement strips the menu sentence(s) from the outgoing reply.
  chat = async () => ({ content: "I am doing well, thanks! You can type \"Menu\" to see the next steps you can take.", toolCalls: [] });
  out = await runBrainTurn({ phone: menuPhone, text: "how are you", messageId: "m9b" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(out?.reply, "I am doing well, thanks!", "menu sentence stripped from the outgoing reply");
  pass("menu-once: hard enforcement strips a repeated menu mention from the reply");

  // Turn 9c: the model's whole reply is a menu mention after the intro -> scripted chain takes over.
  chat = async () => ({ content: "Send the word menu anytime to see every option.", toolCalls: [] });
  out = await runBrainTurn({ phone: menuPhone, text: "what can you do", messageId: "m9c" }, chat);
  assert.equal(out, null, "menu-only repeat falls back to the scripted chain");
  pass("menu-once: a menu-only repeat falls back to the scripted chain");

  // Turn 10: change_role is a tool like every other menu row; the actual role
  // switch stays inside the fixed review code (requestRoleChange).
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("show_feature", { feature: "change_role" })] };
    assert.match(tool.content, /was just sent/, "change_role prompt delivered via the fixed chat path");
    return { content: "Sure - which role would you like UDC to review?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "I want to switch to buyer", messageId: "m10" }, chat);
  assert.equal(out?.handled, true);
  pass("change_role is brain-reachable as a tool; the switch itself stays code-locked");

  // Turn 11 (owner rule, 8 Nov): a bare greeting must never get a form-like
  // dump of registration fields. The guard corrects the model once; the
  // regenerated natural reply goes out.
  const dumpPhone = "+1555000333";
  let dumpCalls = 0;
  chat = async (messages) => {
    dumpCalls++;
    if (dumpCalls === 1) return { content: "Hi! You can begin by sharing your name, business email, company name and registration country to start the registration process. (Send \"menu\" anytime to see all options.)", toolCalls: [] };
    const note = messages.filter((m) => m.role === "system").at(-1)?.content ?? "";
    assert.match(note, /several registration details at once/, "corrective note is given to the model");
    return { content: "Hey! Good to see you here. What can I help you with today?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: dumpPhone, text: "hey", messageId: "m11" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(out?.reply, "Hey! Good to see you here. What can I help you with today?");
  assert.equal(dumpCalls, 2, "exactly one regeneration");
  pass("form-dump guard: an opener stacking registration fields is regenerated into a natural reply");

  // Turn 11b: the model keeps dumping after the correction -> deterministic floor.
  const dumpPhone2 = "+1555000444";
  chat = async () => ({ content: "Please share your name and email and company to begin registration.", toolCalls: [] });
  out = await runBrainTurn({ phone: dumpPhone2, text: "hello", messageId: "m11b" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(out?.reply, "Hi! Happy to chat. What can I help you with today?", "persistent dump gets the deterministic floor");
  pass("form-dump guard: a persistent dump falls back to the fixed natural floor");

  // Turn 11c: even with trade intent, one question at a time - a multi-field
  // ask is corrected; a single-detail question goes through.
  const intentPhone = "+1555000555";
  let intentCalls = 0;
  chat = async (messages) => {
    intentCalls++;
    if (intentCalls === 1) return { content: "Great, let's get you registered. What is your name, and which email should UDC use?", toolCalls: [] };
    const note = messages.filter((m) => m.role === "system").at(-1)?.content ?? "";
    assert.match(note, /ONE thing at a time/, "intent corrective note asks for one thing at a time");
    return { content: "Great, let's get you registered. What is your name?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: intentPhone, text: "I want to register as a buyer", messageId: "m11c" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(out?.reply, "Great, let's get you registered. What is your name?");
  assert.equal(intentCalls, 2, "one regeneration with intent");
  pass("form-dump guard: with trade intent a multi-field ask becomes one question");

  // Turn 12: the session (menu-once lock, collected fields, history) lives
  // across days, not hours.
  [session] = await db.select().from(whatsappChatSessionsTable).where(sql`${whatsappChatSessionsTable.purpose} = 'brain_orchestrator'`).orderBy(sql`${whatsappChatSessionsTable.updatedAt} DESC`).limit(1);
  assert.ok(session?.expiresAt && session.expiresAt.getTime() > Date.now() + 20 * 24 * 3600 * 1000, "session outlives 20 days");
  pass("conversation memory: the brain session persists across days");

  // Turn 13: the whole recent conversation stays in context, so AKIF notices
  // what was already said instead of restarting.
  const longPhone = "+1555000666";
  for (let i = 1; i <= 12; i++) {
    chat = async () => ({ content: `Noted ${i}.`, toolCalls: [] });
    out = await runBrainTurn({ phone: longPhone, text: `message ${i}`, messageId: `L${i}` }, chat);
    assert.equal(out?.handled, true);
  }
  chat = async (messages) => {
    const texts = messages.map((m) => m.content ?? "").join("\n");
    assert.match(texts, /message 1\b/, "earliest message still in context after 12 turns");
    assert.match(texts, /message 12\b/, "latest message in context");
    return { content: "Still here!", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: longPhone, text: "message 13", messageId: "L13" }, chat);
  assert.equal(out?.handled, true);
  pass("conversation memory: full recent history reaches the model on every turn");

  // Turn 14: menu-once holds across sessions and days - a fresh turn on a
  // locked session still forbids the menu even after history scrolled.
  chat = async (messages) => {
    systemSeen = messages.find((m) => m.role === "system")?.content ?? "";
    return { content: "Noted, thanks!", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: menuPhone, text: "one more thing", messageId: "m14" }, chat);
  assert.equal(out?.handled, true);
  assert.match(systemSeen, /NEVER mention, push or repeat the menu again/, "menu stays locked on the persisted session");
  [session] = await db.select().from(whatsappChatSessionsTable).where(sql`${whatsappChatSessionsTable.purpose} = 'brain_orchestrator'`).orderBy(sql`${whatsappChatSessionsTable.updatedAt} DESC`).limit(1);
  assert.equal(session?.data?.brain?.menuMentioned, true, "menu lock still persisted");
  pass("menu-once: the lock persists across turns and reloads");

  // Turns 15-17: the owner's exact live test of 8 Nov 4:00-4:01pm IST.
  // Turn 15: "My father died" - a plain condolence, no menu, no asks.
  const griefPhone = "+1555000777";
  chat = async () => ({ content: "I'm very sorry for your loss. My condolences to you and your family. If there's anything you need or any way I can help, just let me know.", toolCalls: [] });
  out = await runBrainTurn({ phone: griefPhone, text: "My father died", messageId: "m15" }, chat);
  assert.equal(out?.handled, true);
  assert.match(out?.reply ?? "", /sorry for your loss/);
  assert.doesNotMatch(out?.reply ?? "", /menu/i);
  pass("repro turn 1: a grief message gets a plain condolence, no menu, no asks");

  // Turn 16: "I wanna verify my company" - the model answers with the exact
  // 5-item numbered form + menu repeat the owner saw. The guard must correct
  // it to one question and the menu sentence must never leave.
  let reproCalls = 0;
  chat = async (messages) => {
    reproCalls++;
    if (reproCalls === 1) return { content: "Sure, let's update your registration. Please share:\n\n1. Your full name\n2. Business email you use for UDC\n3. Registered company name\n4. Country where the company is registered\n5. Registration number (if you have it)\n\nAfter that I'll send a private upload link for the required document. You can type \"menu\" anytime to see all options.", toolCalls: [] };
    return { content: "Happy to help with verification! What is your full name?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: griefPhone, text: "I wanna verify my company", messageId: "m16" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(reproCalls, 2, "numbered form dump is regenerated once");
  assert.equal(out?.reply, "Happy to help with verification! What is your full name?");
  assert.doesNotMatch(out?.reply ?? "", /menu/i, "no menu repeat leaves");
  assert.doesNotMatch(out?.reply ?? "", /\n\s*2\./, "no numbered list leaves");
  pass("repro turn 2: numbered registration form + menu repeat is corrected to one question");

  // Turn 16b: the model keeps dumping the numbered list after correction ->
  // deterministic floor, still no menu, no list.
  chat = async () => ({ content: "Please share:\n1. Your full name\n2. Business email\n3. Registered company name", toolCalls: [] });
  out = await runBrainTurn({ phone: griefPhone, text: "can we do it now", messageId: "m16b" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(out?.reply, "Happy to help - let's take it one step at a time. What would you like to start with?");
  pass("repro turn 2b: a persistent numbered dump gets the intent floor");

  // Turn 17: the production failure mode - the brain session row is lost
  // (expired, wiped, re-keyed) but the durable menu lock still forbids the
  // menu forever.
  await db.delete(whatsappChatSessionsTable).where(sql`${whatsappChatSessionsTable.purpose} = 'brain_orchestrator'`);
  chat = async (messages) => {
    systemSeen = messages.find((m) => m.role === "system")?.content ?? "";
    return { content: "I am doing well, thanks! You can type \"Menu\" to see the next steps you can take.", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: menuPhone, text: "how are you now", messageId: "m17" }, chat);
  assert.equal(out?.handled, true);
  assert.match(systemSeen, /NEVER mention, push or repeat the menu again/, "durable lock forbids the menu even with a fresh session");
  assert.equal(out?.reply, "I am doing well, thanks!", "menu sentence stripped even after session loss");
  pass("menu-once: the durable lock survives brain-session loss");

  // Turns 18-19 (owner rule, 8 Nov): money conversation with boundaries -
  // the brain READS stated deal terms and RELAYS the customer's words, but no
  // tool exists to accept, counter, discount or approve anything.
  let [buyerUser] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!buyerUser) [buyerUser] = await db.insert(usersTable).values({ phone, role: "buyer", status: "approved", passwordHash: "qa" }).returning();
  const sellerPhone = "+1555999001";
  let [sellerUser] = await db.select().from(usersTable).where(eq(usersTable.phone, sellerPhone)).limit(1);
  if (!sellerUser) [sellerUser] = await db.insert(usersTable).values({ phone: sellerPhone, role: "seller", status: "approved", passwordHash: "qa" }).returning();
  const [product] = await db.insert(productsTable).values({ name: "Cardamom QA" }).returning();
  await db.insert(dealsTable).values({ buyerUserId: buyerUser.id, sellerUserId: sellerUser.id, productId: product.id, quantity: "5", unit: "MT", agreedPrice: "500.00", currency: "USD", incoterm: "FOB", status: "negotiating" });

  // Turn 18: the customer asks the price -> the brain reads the recorded terms.
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("read_deal_terms", {})] };
    assert.match(tool.content, /500.00 USD/, "tool returns the recorded stated price");
    assert.match(tool.content, /never change, accept, counter or approve/, "tool note carries the boundary");
    return { content: "On your deal the stated price is 500 USD per MT, FOB. Want me to pass a message to the seller?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "what is the price?", messageId: "m18" }, chat);
  assert.equal(out?.handled, true);
  assert.match(out?.reply ?? "", /500 USD/);
  pass("money boundary: the brain answers price questions from recorded deal terms");

  // Turn 19: the customer negotiates -> the brain relays their words to the
  // seller. The reply sink (store mode) proves no real send can escape.
  process.env.UDC_APP_ENV = "staging";
  process.env.AKIF_WHATSAPP_REPLY_SINK = "store";
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("relay_to_other_party", { message: "I can do 450 per MT if you ship this week." })] };
    assert.match(tool.content, /relayed to the seller/, "relay confirmed to the model");
    return { content: "Done - I passed your message to the seller and will come back with their reply.", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "tell the seller I can do 450 if he ships this week", messageId: "m19" }, chat);
  assert.equal(out?.handled, true);
  const sunk = readSunkReplies(sellerPhone);
  assert.equal(sunk.length, 1, "exactly one relayed message to the seller");
  assert.match(sunk[0]?.text ?? "", /I can do 450 per MT if you ship this week\./, "the seller gets the customer's own words");
  assert.match(sunk[0]?.text ?? "", /passed on by AKIF/, "the relay is transparent about AKIF");
  assert.doesNotMatch(sunk[0]?.text ?? "", /\+1555/, "no phone numbers leak");
  const relays = await db.select().from(auditLogsTable).where(sql`${auditLogsTable.action} = 'whatsapp_brain_relay'`);
  assert.equal(relays.length, 1, "relay is audit-logged");
  pass("money boundary: negotiation words are relayed to the seller, sink-stored, audited");

  // Turn 19b: a relay that claims an approval is blocked before sending.
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("relay_to_other_party", { message: "Deal approved, payment is approved." })] };
    assert.match(tool.content, /NOT sent/, "approval-claiming relay is refused");
    return { content: "I can't send approval words - I can only pass your own message to the seller.", toolCalls: [] };
  };
  out = await runBrainTurn({ phone, text: "tell him the deal is approved", messageId: "m19b" }, chat);
  assert.equal(out?.handled, true);
  assert.equal(readSunkReplies(sellerPhone).length, 1, "no second message reached the seller");
  pass("money boundary: a relay claiming approval is blocked before sending");

  // Turn 20 (owner rule, 8 Nov): an UNREGISTERED customer asking for the
  // vault link gets no card and no canned gate - the tool sends nothing and
  // the brain explains the link and guides registration in its own words.
  const guestPhone = "+1555000444";
  chat = async (messages) => {
    const tool = messages.filter((m) => m.role === "tool").at(-1);
    if (!tool) return { content: null, toolCalls: [toolCall("show_feature", { feature: "documents" })] };
    assert.match(tool.content, /Nothing was sent/, "unregistered: the tool sends nothing");
    assert.match(tool.content, /private, secure vault page/, "note explains the vault link for the brain");
    return { content: "The vault link is your private, secure page for uploading company documents like your trade license. I'll set it up right after a quick registration - are you a buyer, seller or agent?", toolCalls: [] };
  };
  out = await runBrainTurn({ phone: guestPhone, text: "Send me the vault link", messageId: "m20" }, chat);
  assert.equal(out?.handled, true);
  assert.match(out?.reply ?? "", /vault/);
  assert.equal(readSunkReplies(guestPhone).length, 0, "no card or canned text was sent to the unregistered guest");
  pass("unregistered vault-link ask: nothing sent by the tool, brain explains and guides registration");

  // Turn 21: there is no menu tool - a typed "menu" is answered in words.
  const showFeature = BRAIN_TOOLS.find((t) => t.function?.name === "show_feature");
  assert.ok(showFeature, "show_feature tool exists");
  assert.ok(!JSON.stringify(showFeature.function?.parameters).includes('"menu"'), "no menu option in show_feature");
  pass("typed menu has no tool path: the brain answers in its own words");

  console.log(`brain-orchestrator-postgres: ${checks} checks passed`);
} finally {
  await pool?.end().catch(() => {});
}
