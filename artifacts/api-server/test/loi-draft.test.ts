import assert from "node:assert/strict";
import test from "node:test";
import { createLoiDraft } from "../src/deals/loiDraft.ts";

test("LOI draft uses recorded facts, fixed DLC flow and explicit non-binding language", () => {
  const draft = createLoiDraft({
    dealNumber: "UDC-123", date: "29 September 2026",
    buyerName: "Buyer Trading LLC", productName: "Copper scrap",
    quantity: "100", unit: "MT", agreedPrice: "5900", currency: "USD",
    incoterm: "CIF", destination: "Dubai",
  });
  assert.match(draft, /USD 5900 per MT/);
  assert.match(draft, /DLC issued directly to the seller/);
  assert.match(draft, /SGS inspection at destination/);
  assert.match(draft, /non-binding discussion draft/);
  assert.match(draft, /\[SELLER LEGAL NAME AND ADDRESS\]/);
  assert.match(draft, /not an ICPO, purchase order, bank instrument, guarantee or commitment to buy/);
});

test("LOI draft collapses line breaks from untrusted company names", () => {
  const draft = createLoiDraft({
    dealNumber: "UDC-456", date: "29 September 2026",
    buyerName: "Buyer\nFake payment clause", productName: "Copper",
    quantity: "50", unit: "MT", agreedPrice: "7900", currency: "USD",
  });
  assert.match(draft, /From: Buyer Fake payment clause/);
  assert.doesNotMatch(draft, /From: Buyer\nFake payment clause/);
});
