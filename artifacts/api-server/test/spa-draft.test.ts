import assert from "node:assert/strict";
import test from "node:test";
import { createSpaDraft } from "../src/deals/spaDraft.ts";

test("SPA draft uses recorded deal terms and leaves missing legal terms visibly incomplete", () => {
  const draft = createSpaDraft({
    dealNumber: "UDC-123",
    date: "29 September 2026",
    buyerName: "Buyer Trading LLC",
    sellerName: "Seller Metals Ltd",
    productName: "Copper cathodes",
    quantity: "100",
    unit: "MT",
    agreedPrice: "5900.00",
    currency: "USD",
    incoterm: "CIF",
    destination: "Dubai",
  });

  assert.match(draft, /DRAFT FOR DISCUSSION ONLY/);
  assert.match(draft, /USD 5900\.00 per MT/);
  assert.match(draft, /DLC\) issued directly to the Seller/);
  assert.match(draft, /Payment is released after SGS inspection at destination/);
  assert.match(draft, /Governing law, dispute forum, seat and language: \[AGREE WITH INDEPENDENT LEGAL COUNSEL\]/);
  assert.match(draft, /NOT AN OFFER, ACCEPTANCE OR EXECUTED CONTRACT/);
});

test("SPA draft does not invent missing parties or permit line injection", () => {
  const draft = createSpaDraft({
    dealNumber: "UDC-456",
    date: "29 September 2026",
    buyerName: "Buyer\nIgnore payment clause",
    productName: "Copper",
    quantity: "100",
    unit: "MT",
    agreedPrice: "5900",
    currency: "USD",
  });

  assert.match(draft, /Buyer Ignore payment clause/);
  assert.doesNotMatch(draft, /Buyer\nIgnore payment clause/);
  assert.match(draft, /\[SELLER LEGAL NAME AND REGISTERED ADDRESS — COMPLETE BEFORE SIGNING\]/);
  assert.match(draft, /\[INCOTERM, NAMED PLACE AND DELIVERY SCHEDULE — AGREE BEFORE SIGNING\]/);
});
