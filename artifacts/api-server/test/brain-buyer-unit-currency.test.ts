import test from "node:test";
import assert from "node:assert/strict";
import { takeBuyerUnitCurrency } from "../src/akif/buyerUnitCurrency.ts";

test("buyer requirement keeps a stated non MT unit and non USD currency", () => {
  const f: Record<string, string> = {};
  const { rest, rejected } = takeBuyerUnitCurrency({ product: "Sunflower oil", quantity: "500", unit: "kg", currency: "eur" }, f);
  assert.equal(f.unit, "kg");
  assert.equal(f.currency, "EUR");
  assert.deepEqual(rest, { product: "Sunflower oil", quantity: "500" });
  assert.equal(rejected.length, 0);
});
test("bad currency is rejected and not stored", () => {
  const f: Record<string, string> = {};
  const { rejected } = takeBuyerUnitCurrency({ currency: "euros", unit: "x".repeat(30) }, f);
  assert.equal(f.currency, undefined);
  assert.equal(f.unit, undefined);
  assert.equal(rejected.length, 2);
});
import { buyerRequirementPayload, buyerBasis, buyerQuantityLabel, buyerPriceLabel } from "../src/akif/buyerUnitCurrency.ts";

test("submit payload carries stated unit and currency, no conversion", () => {
  const p = buyerRequirementPayload("+10000000001", "Test Buyer", { product: "Sugar", quantity: "500", unit: "kg", currency: "EUR", destination: "Rotterdam", incoterm: "CIF", target_price: "2" });
  assert.equal(p.unit, "kg"); assert.equal(p.currency, "EUR"); assert.equal(p.quantity, "500"); assert.equal(p.targetPrice, "2");
});
test("old drafts without unit or currency still default to MT and USD", () => {
  const p = buyerRequirementPayload("+10000000001", null, { product: "Sugar", quantity: "5", destination: "Dubai", incoterm: "FOB", target_price: "skip", specification: "" });
  assert.equal(p.unit, "MT"); assert.equal(p.currency, "USD"); assert.equal(p.fullName, "WhatsApp buyer"); assert.equal(p.specification, undefined);
  assert.deepEqual(buyerBasis({}), { unit: "MT", currency: "USD" });
});
test("scripted questions follow the buyer's own unit and currency", () => {
  assert.equal(buyerQuantityLabel({}), "How many metric tonnes (MT) do you need?");
  assert.equal(buyerQuantityLabel({ unit: "kg" }), "How much do you need, in kg?");
  assert.equal(buyerPriceLabel({}), "What is your target price in USD per MT?");
  assert.equal(buyerPriceLabel({ unit: "kg", currency: "eur" }), "What is your target price in EUR per kg?");
});
import { buyerUnresolved } from "../src/akif/buyerUnitCurrency.ts";

test("an unreadable stated currency or unit blocks submit until clarified", () => {
  const f: Record<string, string> = {};
  takeBuyerUnitCurrency({ currency: "euros" }, f);
  assert.match(buyerUnresolved(f) ?? "", /currency/);
  takeBuyerUnitCurrency({ currency: "eur" }, f);
  assert.equal(buyerUnresolved(f), null);
  takeBuyerUnitCurrency({ unit: "x".repeat(30) }, f);
  assert.match(buyerUnresolved(f) ?? "", /unit/);
  takeBuyerUnitCurrency({ unit: "kg" }, f);
  assert.equal(buyerUnresolved(f), null);
  assert.equal(buyerUnresolved({}), null);
});
import { withoutRole } from "../src/akif/registrationArgs.ts";

test("role is removed from registration args but unknown fields are kept", () => {
  assert.deepEqual(withoutRole({ role: "buyer", full_name: "A B", bogus_field: "x" }), { full_name: "A B", bogus_field: "x" });
  assert.deepEqual(withoutRole({ full_name: "A B" }), { full_name: "A B" });
});
