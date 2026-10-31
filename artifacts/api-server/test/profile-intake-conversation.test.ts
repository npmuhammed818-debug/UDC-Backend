import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

test("brain-led profile intake: schema, guards, field filtering and model-down fallback", async () => {
  const output = fileURLToPath(new URL(`./profile-intake-parse-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/profileIntakeConversation.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  const originalWarn = console.warn;
  const logs: unknown[][] = [];
  try {
    console.warn = (...args) => { logs.push(args); };
    const { parseProfileIntakeConversation, interpretProfileIntakeConversation, requirementKeysFor } = await import(output);

    // Requirement capture is role-scoped: agents never collect trade fields.
    assert.deepEqual(requirementKeysFor("profile_agent"), []);
    assert.ok(requirementKeysFor("profile_buyer").includes("target_price"));
    assert.ok(requirementKeysFor("profile_seller").includes("price"));
    assert.ok(!requirementKeysFor("profile_buyer").includes("price"));

    const valid = {
      fields: { full_name: "Asha Nair", email: "asha@fictionmetals.ae", company_name: "Fiction Metals FZE", country: "UAE" },
      requirements: { product: "Copper cathodes", quantity: "500", destination: "Mundra", incoterm: "CIF", target_price: "8500", price: "999" },
      reply: "Hi Asha, got all of that. What is the best company email for Fiction Metals?",
    };
    const parsed = parseProfileIntakeConversation(JSON.stringify(valid));
    assert.equal(parsed.fields.full_name, "Asha Nair");
    assert.equal(parsed.fields.email, "asha@fictionmetals.ae");
    assert.equal(parsed.requirements.product, "Copper cathodes");
    assert.equal(parsed.requirements.quantity, "500");
    assert.equal(parsed.requirements.price, "999"); // role filtering happens at the caller
    assert.equal(parsed.reply.length > 0, true);

    // Unknown keys are dropped, never stored.
    const unknown = parseProfileIntakeConversation(JSON.stringify({ ...valid, fields: { ...valid.fields, password: "secret", bank: "123" }, requirements: { admin_note: "x" } }));
    assert.equal(unknown.fields.password, undefined);
    assert.equal(unknown.fields.bank, undefined);
    assert.equal(unknown.requirements.admin_note, undefined);

    // Non-string field values are dropped, not coerced.
    const coerced = parseProfileIntakeConversation(JSON.stringify({ ...valid, fields: { full_name: "Asha Nair", email: 42 }, requirements: { quantity: 500 } }));
    assert.equal(coerced.fields.email, undefined);
    assert.equal(coerced.requirements.quantity, undefined);
    assert.equal(coerced.fields.full_name, "Asha Nair");

    // Bad JSON and bad schema are rejected.
    assert.equal(parseProfileIntakeConversation("PRIVATE_BAD_JSON"), null);
    assert.equal(parseProfileIntakeConversation(JSON.stringify({ fields: valid.fields, requirements: {}, reply: "" })), null);
    assert.equal(parseProfileIntakeConversation(JSON.stringify({ fields: valid.fields, requirements: {}, reply: "x".repeat(1201) })), null);
    assert.equal(parseProfileIntakeConversation(JSON.stringify({ ...valid, reply: ["not", "a", "string"] })), null);

    // Unsafe storage references never reach the customer.
    assert.equal(parseProfileIntakeConversation(JSON.stringify({ ...valid, reply: "see storage://private/key" })), null);

    // Registration can never claim approvals, matches or payments.
    for (const reply of ["Great, a seller has accepted your request.", "Payment has been received.", "I matched you with a verified seller.", "Your account is verified."])
      assert.equal(parseProfileIntakeConversation(JSON.stringify({ ...valid, reply })), null, "unverified claim must be rejected: " + reply);
    assert.match(JSON.stringify(logs), /unverified_claim/);
    assert.match(JSON.stringify(logs), /invalid_json/);
    assert.match(JSON.stringify(logs), /invalid_schema/);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE/);

    // Model unavailable: the caller must fall back to fixed questions.
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => { throw new Error("synthetic_model_down"); };
      const decision = await interpretProfileIntakeConversation({ message: "I am Asha from Fiction Metals", purpose: "profile_buyer", collected: {} });
      assert.equal(decision, null);
    } finally { globalThis.fetch = originalFetch; }
    assert.match(JSON.stringify(logs), /model_request_failed|invalid_json|invalid_schema/);

    // Empty and oversized messages never reach the model.
    let calls = 0;
    const countingFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => { calls++; throw new Error("should_not_be_called"); };
      assert.equal(await interpretProfileIntakeConversation({ message: "   ", purpose: "profile_buyer", collected: {} }), null);
      assert.equal(await interpretProfileIntakeConversation({ message: "x".repeat(6001), purpose: "profile_buyer", collected: {} }), null);
      assert.equal(calls, 0);
    } finally { globalThis.fetch = countingFetch; }

    // Broken brain JSON gets one stricter retry; other rejections stay single-attempt.
    const brainUrlBefore = process.env.AKIF_BRAIN_URL;
    process.env.AKIF_BRAIN_URL = "http://127.0.0.1:9/synthetic-brain";
    const brainResponse = (content: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) }) as Response;
    try {
      let brainCalls = 0;
      globalThis.fetch = async () => { brainCalls++; return brainCalls === 1 ? brainResponse("PRIVATE_BROKEN_JSON") : brainResponse(JSON.stringify(valid)); };
      const retried = await interpretProfileIntakeConversation({ message: "I am Asha from Fiction Metals", purpose: "profile_buyer", collected: {} });
      assert.equal(retried?.fields?.full_name, "Asha Nair", "a broken first reply is retried once and can succeed");
      assert.equal(brainCalls, 2);
      assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_BROKEN_JSON/);

      brainCalls = 0;
      globalThis.fetch = async () => { brainCalls++; return brainResponse("still broken"); };
      assert.equal(await interpretProfileIntakeConversation({ message: "I am Asha", purpose: "profile_buyer", collected: {} }), null);
      assert.equal(brainCalls, 2, "two broken replies stop after exactly one retry");

      brainCalls = 0;
      globalThis.fetch = async () => { brainCalls++; return brainResponse(JSON.stringify({ ...valid, reply: "Your account is verified." })); };
      assert.equal(await interpretProfileIntakeConversation({ message: "I am Asha", purpose: "profile_buyer", collected: {} }), null);
      assert.equal(brainCalls, 1, "a non-JSON rejection is never retried");
    } finally {
      globalThis.fetch = originalFetch;
      if (brainUrlBefore === undefined) delete process.env.AKIF_BRAIN_URL; else process.env.AKIF_BRAIN_URL = brainUrlBefore;
    }
  } finally { console.warn = originalWarn; await unlink(output); }
});
