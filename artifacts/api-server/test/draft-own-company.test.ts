import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDraftModel, renderModelText } from "../src/deals/draftModel.ts";

const terms = { dealNumber: "DEMO-0001", date: "27 October 2026", productName: "Copper", quantity: "100", unit: "MT", agreedPrice: "5000", currency: "USD", incoterm: "CIF", destination: "Jebel Ali" };

test("requester's own company fills one side and the other side stays hidden", () => {
  const text = renderModelText(buildDraftModel("LOI", { ...terms, buyerName: "Acme Metals Ltd", buyerAddress: "1 Test Road", buyerRegistrationNo: "REG-1", hideSeller: true }));
  assert.match(text, /Acme Metals Ltd/); assert.match(text, /1 Test Road \| REG-1/);
  assert.match(text, /\[SELLER - disclosed after NCNDA\]/);
  assert.doesNotMatch(text, /\[SELLER LEGAL NAME\]/);
});
test("missing profile fields stay placeholders, never guessed", () => {
  const text = renderModelText(buildDraftModel("LOI", { ...terms, buyerName: "Acme Metals Ltd", hideSeller: true }));
  assert.match(text, /\[REGISTERED ADDRESS\] \| \[REGISTRATION NO\.\]/);
});
test("India option sets the law slot and keeps the lawyer marker; default is unchanged", () => {
  for (const t of ["LOI", "ICPO", "SPA", "NCNDA"] as const) {
    assert.match(renderModelText(buildDraftModel(t, { ...terms, governingLaw: "India" })), /India\. \[LAWYER TO CONFIRM\]/, t);
    assert.doesNotMatch(renderModelText(buildDraftModel(t, terms)), /India\./, t);
  }
});
