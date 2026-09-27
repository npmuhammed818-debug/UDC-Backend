import assert from "node:assert/strict";
import { test } from "node:test";
import { directDealFactReply } from "../src/akif/dealFactReply.ts";

const deal = {
  status: "negotiation",
  quantity: "50",
  unit: "MT",
  agreedPrice: "7000",
  currency: "USD",
  incoterm: "CIF",
  destination: "Jebel Ali",
};

test("answers current deal facts locally", () => {
  assert.match(directDealFactReply("what is the current deal status?", deal) ?? "", /negotiation/i);
  assert.match(directDealFactReply("what is the current price?", deal) ?? "", /USD 7000/);
  assert.match(directDealFactReply("confirmed qty?", deal) ?? "", /50 MT/);
  assert.match(directDealFactReply("where is the confirmed destination?", deal) ?? "", /Jebel Ali/);
  assert.match(directDealFactReply("what is the current incoterm?", deal) ?? "", /CIF/);
});

test("does not hijack negotiation questions", () => {
  for (const message of [
    "what price can he do?",
    "can the seller do $5,900?",
    "what quantity can he supply?",
    "could he deliver to Dubai?",
    "will he do FOB?",
    "can he change the price?",
  ]) {
    assert.equal(directDealFactReply(message, deal), null, message);
  }
});

test("handles common typo-style fact questions", () => {
  assert.match(directDealFactReply("wht is current price?", deal) ?? "", /USD 7000/);
  assert.match(directDealFactReply("whr is confirmed destination?", deal) ?? "", /Jebel Ali/);
});


test("trade-term education is not mistaken for the current deal Incoterm", () => {
  assert.equal(directDealFactReply("what is CIF?", deal), null);
  assert.equal(directDealFactReply("what is FOB?", deal), null);
  assert.match(directDealFactReply("what is the incoterm?", deal) ?? "", /CIF/);
});


test("instant deal facts sound like a person, not a database", () => {
  const messages = [
    directDealFactReply("what is the current deal status?", deal),
    directDealFactReply("what is the current price?", deal),
    directDealFactReply("confirmed qty?", deal),
  ].filter(Boolean).join(" ");

  assert.doesNotMatch(messages, /confirmed terms in UDC|confirmed price in UDC|confirmed quantity in UDC|recorded for this deal/i);
});


test("deal fact replies format stored numeric precision for humans", () => {
  const preciseDeal = {
    ...deal,
    quantity: "100.000000",
    agreedPrice: "5900.00",
  };

  assert.equal(
    directDealFactReply("what is the current price?", preciseDeal),
    "$5,900/MT right now.",
  );
  assert.equal(
    directDealFactReply("confirmed qty?", preciseDeal),
    "100 MT right now.",
  );
});
