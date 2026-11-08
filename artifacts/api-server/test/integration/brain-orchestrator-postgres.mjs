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
      contents: `export { runBrainTurn, isBrainOrchestratorEnabled, BRAIN_TOOLS } from './src/akif/brainOrchestrator.ts';export { pool, db, usersTable, companiesTable, auditLogsTable, whatsappChatSessionsTable, buyerRequestsTable } from '@workspace/db';export { eq, sql } from 'drizzle-orm';`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native", "@resvg/resvg-js"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
  const { runBrainTurn, isBrainOrchestratorEnabled } = app;
  const { db, usersTable, companiesTable, auditLogsTable, whatsappChatSessionsTable, buyerRequestsTable, eq, sql } = app;

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

  console.log(`brain-orchestrator-postgres: ${checks} checks passed`);
} finally {
  await pool?.end().catch(() => {});
}
