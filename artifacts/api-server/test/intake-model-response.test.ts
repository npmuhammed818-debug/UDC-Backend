import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isExplicitSeparateTradeIntake, isStandaloneBuyerInquiry } from "../src/akif/dealDecisionSafety.ts";

test("complete natural inquiries stand alone while corrections and partial followups retain context", () => {
  assert.equal(isStandaloneBuyerInquiry("I need 100 MT copper cathode, target USD 5,900 per MT, CIF Jebel Ali"), true);
  assert.equal(isStandaloneBuyerInquiry("We require 200 MT sugar at USD 500 per MT to Mombasa"), true);
  for (const message of ["I need 100 MT copper", "I need the same 100 MT copper at USD 5900 CIF Jebel Ali", "I need 100 MT copper at USD 5900 CIF Jebel Ali for this deal", "Can you change it to 100 MT copper at USD 5900 CIF Jebel Ali?", "I need 100 MT copper at USD 5900 CIF Jebel Ali instead"]) assert.equal(isStandaloneBuyerInquiry(message), false);
});

test("separate-intake routing requires an explicit new inquiry, not a correction or hypothetical", () => {
  assert.equal(isExplicitSeparateTradeIntake("New separate test requirement: I need 100 MT copper cathode, USD 5900, CIF Jebel Ali."), true);
  for (const message of ["Make it 100 MT copper", "Do not create a new requirement: I need 100 MT copper", "What if I have another requirement for 100 MT copper?", "New requirement: what is copper?"]) assert.equal(isExplicitSeparateTradeIntake(message), false);
});

test("intake validation normalizes exact numeric strings and rejects unsafe coercion without logging private values", async () => {
  const output = fileURLToPath(new URL(`./intake-parse-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/intakeConversation.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  const originalWarn = console.warn;
  const logs: unknown[][] = [];
  try {
    console.warn = (...args) => { logs.push(args); };
    const { parseIntakeConversation } = await import(output);
    const valid = { role: "buyer", newIntake: true, fields: { product: "Copper", quantity: 100, targetPrice: 5900, currency: "USD", destination: "Jebel Ali", specification: "Grade A", deliveryTime: "30 days", monthlyCapacity: 1000, price: null, originCountry: null }, reply: "I’ll send this for UDC review." };
    const parsed = parseIntakeConversation(JSON.stringify(valid));
    assert.equal(parsed.fields.quantity, 100); assert.equal(parsed.fields.targetPrice, 5900);
    assert.equal(parsed.fields.specification, "Grade A"); assert.equal(parsed.fields.deliveryTime, "30 days"); assert.equal(parsed.fields.monthlyCapacity, 1000);
    assert.equal(parsed.fields.price, undefined); assert.equal(parsed.fields.originCountry, undefined);
    const quotedNumbers = parseIntakeConversation(JSON.stringify({ ...valid, fields: { ...valid.fields, quantity: "100", targetPrice: "5,900.50", monthlyCapacity: "1,000", minimumOrderQuantity: "50" } }));
    assert.equal(quotedNumbers.fields.quantity, 100); assert.equal(quotedNumbers.fields.targetPrice, 5900.5);
    assert.equal(quotedNumbers.fields.monthlyCapacity, 1000); assert.equal(quotedNumbers.fields.minimumOrderQuantity, 50);
    assert.equal(logs.length, 0);
    for (const quantity of ["", " ", "100 MT", "USD 100", "1e2", "0x64", "1,00", "1,000,00", "Infinity", "NaN", "-1", "0", true, false]) {
      assert.equal(parseIntakeConversation(JSON.stringify({ ...valid, fields: { quantity } })), null);
    }
    assert.equal(parseIntakeConversation(JSON.stringify({ ...valid, fields: { quantity: "PRIVATE_TRADE_VALUE" } })), null);
    assert.equal(parseIntakeConversation("PRIVATE_BAD_JSON"), null);
    assert.equal(parseIntakeConversation(JSON.stringify({ ...valid, reply: "storage://private/key" })), null);
    assert.match(JSON.stringify(logs), /invalid_schema/); assert.match(JSON.stringify(logs), /invalid_json/);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|storage:\/\//);
  } finally { console.warn = originalWarn; await unlink(output); }
});
