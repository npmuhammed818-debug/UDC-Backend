import assert from "node:assert/strict";
import { test } from "node:test";
import { triageBuyerRequirement } from "../src/akif/buyerRequirementTriage.ts";
import { isSellerOffer, triageSellerOffer } from "../src/akif/sellerOfferTriage.ts";
import { mergeSellerOfferDraft } from "../src/akif/intakeDraftMerge.ts";
import { sellerOfferReply } from "../src/akif/sellerOfferReply.ts";

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

test("keeps a seller's shorthand price, origin and purity without requiring a destination", () => {
  const draft = triageSellerOffer(
    "I have copper millberry scrap\n10k USD per MT\norigin Kenya\npurity 99.8%",
  );

  assert.equal(draft.product, "Copper Millberry");
  assert.equal(draft.price, 10_000);
  assert.equal(draft.currency, "USD");
  assert.equal(draft.unit, "MT");
  assert.equal(draft.originCountry, "Kenya");
  assert.equal(draft.specification, "99.8%");
  assert.deepEqual(draft.missingFields, ["quantity"]);
  assert.equal(sellerOfferReply(draft), "What quantity can you supply?");
});

test("does not ask for price again after the seller supplies the missing quantity", () => {
  const initial = triageSellerOffer("I have copper millberry scrap, 10k USD per MT, origin Kenya");
  const complete = mergeSellerOfferDraft(
    initial,
    triageSellerOffer("Minimum 100 MT whatever buyer wants"),
  );

  assert.equal(complete.quantity, 100);
  assert.equal(complete.price, 10_000);
  assert.deepEqual(complete.missingFields, []);
  assert.equal(sellerOfferReply(complete), "Thanks, I have the key offer details. I’ll send them to UDC for review.");
});

test("captures an optional seller destination when CIF includes a named port", () => {
  const draft = triageSellerOffer("Copper cathode, 100 MT, USD 5,900 per MT, CIF Jebel Ali");
  assert.equal(draft.incoterm, "CIF");
  assert.equal(draft.destination, "Jebel Ali");
});
