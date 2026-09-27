import assert from "node:assert/strict";
import { test } from "node:test";
import { requestedDealDocumentDeliveryTarget } from "../src/akif/dealDocumentRouting.ts";

test("document routing sends explicit buyer/seller targets to the intended side", () => {
  assert.equal(requestedDealDocumentDeliveryTarget("share the FCO to buyer", "seller"), "counterparty");
  assert.equal(requestedDealDocumentDeliveryTarget("send LOI to seller", "buyer"), "counterparty");
  assert.equal(requestedDealDocumentDeliveryTarget("send FCO to buyer", "buyer"), "sender");
  assert.equal(requestedDealDocumentDeliveryTarget("send LOI to seller", "seller"), "sender");
});

test("document routing keeps 'here/to me' local and pronouns go to the other side", () => {
  assert.equal(requestedDealDocumentDeliveryTarget("send the 2nd fco here", "seller"), "sender");
  assert.equal(requestedDealDocumentDeliveryTarget("send the LOI to me", "buyer"), "sender");
  assert.equal(requestedDealDocumentDeliveryTarget("share it with him", "seller"), "counterparty");
  assert.equal(requestedDealDocumentDeliveryTarget("send it to the other side", "buyer"), "counterparty");
});
