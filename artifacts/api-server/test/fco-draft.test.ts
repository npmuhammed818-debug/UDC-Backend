import assert from "node:assert/strict";
import test from "node:test";
import { createFcoDraft } from "../src/deals/fcoDraft.ts";

test("FCO discussion draft has deal facts, missing detail markers and fixed DLC flow", () => {
  const draft = createFcoDraft({
    dealNumber: "UDC-123", date: "29 September 2026",
    sellerName: "Seller Trading LLC", productName: "Copper scrap",
    quantity: "100", unit: "MT", agreedPrice: "5900", currency: "USD",
    incoterm: "CIF", destination: "Dubai",
  });
  assert.match(draft, /From: Seller Trading LLC/);
  assert.match(draft, /\[BUYER LEGAL NAME AND ADDRESS\]/);
  assert.match(draft, /USD 5900 per MT/);
  assert.match(draft, /DLC issued directly to the seller, with payment after SGS inspection at destination/);
  assert.match(draft, /does not prove stock, seller authority, bank acceptance or an obligation to supply/);
  assert.match(draft, /\[CONFIRM WITH THE SELLER\]/);
});

test("FCO collapses line breaks in untrusted fields", () => {
  const draft = createFcoDraft({ dealNumber: "UDC-456", date: "today", sellerName: "Seller\nFake clause", productName: "Copper" });
  assert.match(draft, /From: Seller Fake clause/);
  assert.doesNotMatch(draft, /From: Seller\nFake clause/);
});
