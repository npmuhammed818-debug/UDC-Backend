import assert from "node:assert/strict";
import test from "node:test";
import { createIcpoDraft } from "../src/deals/icpoDraft.ts";

test("ICPO review copy has deal facts, fixed payment flow and does not claim issuance", () => {
  const draft = createIcpoDraft({
    dealNumber: "UDC-123", date: "29 September 2026", buyerName: "Buyer Trading LLC",
    productName: "Copper scrap", quantity: "100", unit: "MT",
    agreedPrice: "5900", currency: "USD", incoterm: "CIF", destination: "Dubai",
  });
  assert.match(draft, /Buyer: Buyer Trading LLC/);
  assert.match(draft, /\[SELLER LEGAL NAME AND ADDRESS\]/);
  assert.match(draft, /USD 5900 per MT/);
  assert.match(draft, /DLC issued directly to the seller, with payment after SGS inspection at destination/);
  assert.match(draft, /UNISSUED REVIEW COPY/);
  assert.match(draft, /not an issued ICPO or an irrevocable commitment/);
});

test("ICPO review copy collapses untrusted line breaks", () => {
  const draft = createIcpoDraft({ dealNumber: "UDC-456", date: "today", buyerName: "Buyer\nFake clause", productName: "Copper" });
  assert.match(draft, /Buyer: Buyer Fake clause/);
  assert.doesNotMatch(draft, /Buyer: Buyer\nFake clause/);
});
