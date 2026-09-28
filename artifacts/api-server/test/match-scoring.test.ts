import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreTradeMatch } from "../src/marketplace/matchScoring.ts";

const buyer = {
  quantity: "100",
  unit: "MT",
  targetPrice: "6000",
  currency: "USD",
  destination: "Port of Jebel Ali",
  preferredIncoterm: "CIF",
  specification: "Copper cathode Grade A",
};
const seller = {
  quantity: "50",
  monthlyCapacity: "120",
  minimumOrderQuantity: "25",
  unit: "MT",
  price: "5900",
  currency: "USD",
  destination: "Jebel Ali",
  incoterm: "CIF",
  specification: "Grade A copper cathode",
};

test("scores recurring capacity, target price, Incoterm, destination and spec fit", () => {
  const match = scoreTradeMatch(buyer, seller);
  assert.equal(match.score, 100);
  assert.ok(match.reasons.includes("monthly capacity covers the request"));
  assert.ok(match.reasons.includes("preferred Incoterm matches"));
  assert.ok(match.reasons.includes("destination is compatible"));
});

test("penalizes incompatible units and unmet minimum orders", () => {
  const match = scoreTradeMatch(buyer, {
    ...seller,
    unit: "KG",
    monthlyCapacity: null,
    minimumOrderQuantity: "250",
    incoterm: "FOB",
    destination: "Rotterdam",
    price: "6500",
  });
  assert.ok(match.score < 50);
  assert.ok(match.reasons.includes("quantity units differ; manual review needed"));
  assert.ok(match.reasons.includes("seller destination differs from the request"));
  const minimumOrder = scoreTradeMatch(buyer, {
    ...seller,
    quantity: "25",
    monthlyCapacity: null,
    minimumOrderQuantity: "250",
  });
  assert.ok(minimumOrder.reasons.includes("minimum order exceeds the requested quantity"));
});

test("does not compare prices across different currencies", () => {
  const match = scoreTradeMatch(buyer, { ...seller, currency: "EUR", price: "5000" });
  assert.ok(!match.reasons.some((reason) => reason.includes("target price")));
});
