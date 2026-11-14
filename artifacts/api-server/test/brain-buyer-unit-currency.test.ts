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
