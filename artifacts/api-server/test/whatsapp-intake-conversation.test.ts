import assert from "node:assert/strict";
import { test } from "node:test";
import { triageBuyerRequirement } from "../src/akif/buyerRequirementTriage.ts";
import { triageSellerOffer } from "../src/akif/sellerOfferTriage.ts";
import { mergeBuyerRequirementDraft, mergeSellerOfferDraft } from "../src/akif/intakeDraftMerge.ts";

test("buyer intake behaves like one conversation across separate WhatsApp messages", () => {
  const first = mergeBuyerRequirementDraft(
    null,
    triageBuyerRequirement("I need copper 50mt"),
    "I need copper 50mt",
  );

  assert.equal(first.product?.toLowerCase(), "copper");
  assert.equal(first.quantity, 50);
  assert.deepEqual(first.missingFields, ["targetPrice", "destination"]);

  const second = mergeBuyerRequirementDraft(
    first,
    triageBuyerRequirement("7900usd"),
    "7900usd",
  );

  assert.equal(second.quantity, 50);
  assert.equal(second.targetPrice, 7900);
  assert.deepEqual(second.missingFields, ["destination"]);

  const third = mergeBuyerRequirementDraft(
    second,
    triageBuyerRequirement("Dubai I alrdy said that right"),
    "Dubai I alrdy said that right",
  );

  assert.equal(third.product?.toLowerCase(), "copper");
  assert.equal(third.quantity, 50);
  assert.equal(third.targetPrice, 7900);
  assert.equal(third.destination, "Dubai");
  assert.deepEqual(third.missingFields, []);
});

test("buyer can refine a generic copper requirement naturally", () => {
  const first = mergeBuyerRequirementDraft(
    null,
    triageBuyerRequirement("I need copper 50 MT"),
    "I need copper 50 MT",
  );
  const refined = mergeBuyerRequirementDraft(
    first,
    triageBuyerRequirement("millberry"),
    "millberry",
  );

  assert.equal(refined.product, "Copper Millberry");
  assert.equal(refined.quantity, 50);
});

test("seller offer keeps context when price arrives in a later message", () => {
  const first = mergeSellerOfferDraft(
    null,
    triageSellerOffer("We can supply 50 MT copper"),
  );
  const second = mergeSellerOfferDraft(
    first,
    triageSellerOffer("7900usd"),
  );

  assert.equal(second.product?.toLowerCase(), "copper");
  assert.equal(second.quantity, 50);
  assert.equal(second.price, 7900);
  assert.deepEqual(second.missingFields, []);
});

test("generic products are captured without copper-only logic", () => {
  const buyer = triageBuyerRequirement(
    "I need 20 MT frozen chicken to Dubai at USD 2,500",
  );

  assert.equal(buyer.product?.toLowerCase(), "frozen chicken");
  assert.equal(buyer.quantity, 20);
  assert.equal(buyer.destination, "Dubai");
  assert.equal(buyer.targetPrice, 2500);
});
