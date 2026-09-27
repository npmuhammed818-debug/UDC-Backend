import assert from "node:assert/strict";
import { test } from "node:test";
import { triageBuyerRequirement } from "../src/akif/buyerRequirementTriage.ts";
import { isSellerOffer, triageSellerOffer } from "../src/akif/sellerOfferTriage.ts";

test("captures a natural buyer requirement without command phrasing", () => {
  const draft = triageBuyerRequirement(
    "Hello, we need 500 MT Copper Millberry monthly, CIF Jebel Ali, maximum USD 6,000 per MT.",
  );

  assert.equal(draft.product, "Copper Millberry");
  assert.equal(draft.quantity, 500);
  assert.equal(draft.unit, "MT");
  assert.equal(draft.targetPrice, 6000);
  assert.equal(draft.currency, "USD");
  assert.equal(draft.incoterm, "CIF");
  assert.equal(draft.destination, "Jebel Ali");
  assert.deepEqual(draft.missingFields, []);
});

test("asks only for the missing trade fields", () => {
  const draft = triageBuyerRequirement("We need Copper Cathode, CIF.");

  assert.equal(draft.product, "Copper Cathode");
  assert.deepEqual(draft.missingFields, ["quantity", "targetPrice", "destination"]);
});

test("recognizes a natural seller offer and captures its commercial terms", () => {
  const message = "We have available 250 MT Copper Cathode from Zambia at USD 9,100/MT FOB.";
  const draft = triageSellerOffer(message);

  assert.equal(isSellerOffer(message), true);
  assert.equal(draft.product, "Copper Cathode");
  assert.equal(draft.quantity, 250);
  assert.equal(draft.price, 9100);
  assert.equal(draft.currency, "USD");
  assert.equal(draft.originCountry, "Zambia");
  assert.equal(draft.incoterm, "FOB");
  assert.deepEqual(draft.missingFields, []);
});

test("does not treat a buyer requirement as a seller offer", () => {
  assert.equal(isSellerOffer("I need 100 MT copper scrap delivered to Mumbai."), false);
});
