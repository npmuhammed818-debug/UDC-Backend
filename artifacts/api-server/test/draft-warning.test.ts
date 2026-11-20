import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UDC_DRAFT_WARNING_BOTTOM, UDC_DRAFT_WARNING_TOP } from "../src/deals/draftWarning.ts";
import { buildDraftModel, formatAmount, renderModelText, totalValue, type DraftType } from "../src/deals/draftModel.ts";
import { renderDraftPdf } from "../src/deals/draftPdf.ts";
import { generateWhatsAppDraft, generateWhatsAppDraftPdf } from "../src/deals/whatsappDraft.ts";
import { createNcndaDraft } from "../src/deals/ncndaDraft.ts";

const types: DraftType[] = ["LOI", "ICPO", "FCO", "SPA", "NCNDA"];
const terms = { dealNumber: "DEMO-0001", date: "26 October 2026", productName: "Sample product", quantity: "500.000", unit: "MT", agreedPrice: "8400.00", currency: "USD", incoterm: "CIF", destination: "Sample Port" };

test("every draft text starts and ends with the UDC warning (WhatsApp text, model text)", () => {
  for (const t of types) {
    const a = generateWhatsAppDraft(t, terms), b = renderModelText(buildDraftModel(t, terms));
    for (const text of [a, b]) { assert.ok(text.startsWith(UDC_DRAFT_WARNING_TOP), t); assert.ok(text.endsWith(UDC_DRAFT_WARNING_BOTTOM), t); }
    assert.match(b, /introducing agent/i);
  }
  const ncnda = createNcndaDraft({ dealNumber: "X", date: "d" });
  assert.ok(ncnda.startsWith(UDC_DRAFT_WARNING_TOP) && ncnda.endsWith(UDC_DRAFT_WARNING_BOTTOM));
});

test("the warning never says UDC is a party and marks the agent role for a lawyer", () => {
  assert.doesNotMatch(UDC_DRAFT_WARNING_TOP + UDC_DRAFT_WARNING_BOTTOM, /is not a party/i);
  assert.match(UDC_DRAFT_WARNING_BOTTOM, /LAWYER TO CONFIRM/);
});

test("all 5 drafts render to a valid PDF, even with odd characters in the data", async () => {
  for (const t of types) {
    const bytes = await generateWhatsAppDraftPdf(t, { ...terms, productName: "Copper \u20b9 \u4e2d\u6587 \u2014 test", buyerName: "A\nB" });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    assert.ok(bytes.length > 2000, t);
  }
  const model = buildDraftModel("SPA", terms); model.blocks.push(...Array.from({ length: 60 }, (_, i) => ({ k: "cl" as const, n: `99.${i}`, t: "Long clause. ".repeat(30) })));
  assert.ok((await renderDraftPdf(model)).length > 2000);
});

test("amounts are grouped and the total is exact, never rounded", () => {
  assert.equal(formatAmount("8400.00", "x", 2), "8,400.00");
  assert.equal(formatAmount("500.000", "x"), "500");
  assert.equal(formatAmount("abc", "[PRICE]"), "[PRICE]");
  assert.equal(totalValue("500.000", "8400.00"), "4,200,000.00");
  assert.equal(totalValue("1000", "520"), "520,000.00");
  assert.equal(totalValue("0.333", "1.111"), "0.369963");
  assert.equal(totalValue("x", "1"), null);
});

test("the WhatsApp confirmation offers own upload or UDC draft with the warning", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/routes/whatsappWebhook.ts"), "utf8");
  assert.match(source, /Send your own or use a UDC draft\?/);
  assert.match(source, /Your own: send your/);
  assert.match(source, /the UDC draft is a template only\. It is not legal advice/);
});
