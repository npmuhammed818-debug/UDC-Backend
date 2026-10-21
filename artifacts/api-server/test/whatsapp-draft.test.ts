import { test } from "node:test";
import assert from "node:assert/strict";
import { requestedWhatsAppDraft, mayPrepareWhatsAppDraft, whatsappDraftConfirmation, generateWhatsAppDraft } from "../src/deals/whatsappDraft.ts";

const terms = { dealNumber: "UDC-TEST", date: "21 October 2026", productName: "Copper cathode", quantity: "100", unit: "MT", agreedPrice: "5900", currency: "USD", incoterm: "CIF", destination: "Jebel Ali" };
test("WhatsApp draft actions require explicit requests and respect party roles", () => {
  for (const text of ["What is an LOI?", "send LOI to the seller", "do not generate LOI", "if we generate LOI", "prepare SPA and send it to the seller"]) assert.equal(requestedWhatsAppDraft(text), null);
  assert.deepEqual(requestedWhatsAppDraft("Please prepare an LOI draft for me."), { type: "LOI", confirmed: false });
  assert.deepEqual(requestedWhatsAppDraft("CONFIRM DRAFT SPA"), { type: "SPA", confirmed: true });
  assert.equal(mayPrepareWhatsAppDraft("LOI", false), false);
  assert.equal(mayPrepareWhatsAppDraft("ICPO", false), false);
  assert.equal(mayPrepareWhatsAppDraft("FCO", true), false);
  assert.equal(mayPrepareWhatsAppDraft("FCO", false), true);
});
test("all existing document generators produce explicit WhatsApp review drafts", () => {
  for (const type of ["LOI", "ICPO", "FCO", "SPA", "NCNDA"] as const) {
    const draft = generateWhatsAppDraft(type, terms);
    assert.match(draft, /DRAFT|REVIEW/);
    assert.match(draft, /UDC-TEST/);
    assert.match(draft, /\[/); // Missing legal details remain visible placeholders.
    if (type !== "NCNDA") { assert.match(draft, /DLC/); assert.match(draft, /SGS/); }
  }
});
test("draft confirmation expires when recorded commercial terms change", () => {
  const original = whatsappDraftConfirmation("SPA", terms);
  for (const change of [{ agreedPrice: "6000" }, { quantity: "200" }, { destination: "Mumbai" }, { productName: "Sugar" }]) {
    assert.notEqual(whatsappDraftConfirmation("SPA", { ...terms, ...change }), original);
  }
  assert.equal(whatsappDraftConfirmation("SPA", { ...terms, date: "22 October 2026" }), original);
  assert.notEqual(whatsappDraftConfirmation("LOI", terms), original);
});

 test('alternate accepted payment terms remain in drafts and invalidate older draft confirmations',()=>{
 const terms={dealNumber:'UDC-TEST',date:'21 October 2026',productName:'Test goods',quantity:'100',unit:'MT',agreedPrice:'490',currency:'USD',incoterm:'EXW',destination:'Agreed warehouse',paymentTerms:'30% advance and 70% on delivery',inspectionTerms:'Independent inspection before loading'};
 for(const type of ['LOI','ICPO','FCO','SPA'] as const){const draft=generateWhatsAppDraft(type,terms);assert.match(draft,/30% advance and 70% on delivery/);assert.doesNotMatch(draft,/Payment framework: DLC|commercial framework recorded.*documentary letter/);}
 assert.notEqual(whatsappDraftConfirmation('SPA',terms),whatsappDraftConfirmation('SPA',{...terms,paymentTerms:'100% advance'}));
 });
