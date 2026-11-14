import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static read of the catalog source: importing the orchestrator pulls the database layer.
const src = readFileSync(new URL("../src/akif/brainOrchestrator.ts", import.meta.url), "utf8");
const start = src.indexOf("export const BRAIN_TOOLS");
const block = src.slice(start, src.indexOf("];", start));
const BRAIN_TOOLS = [...block.matchAll(/function: \{ name: "([a-z_]+)", description: "((?:[^"\\]|\\.)*)"(.*)/g)].map((m) => ({ function: { name: m[1], description: m[2], parameters: m[3] } }));
const names = BRAIN_TOOLS.map((t) => t.function.name);

test("tool names are unique and every tool has a real description", () => {
  assert.equal(new Set(names).size, names.length);
  for (const t of BRAIN_TOOLS) assert.ok((t.function.description ?? "").length > 30, t.function.name);
});
test("every submit tool tells the model it needs saved fields and customer confirmation", () => {
  for (const n of names.filter((x) => x.startsWith("submit_"))) {
    const d = BRAIN_TOOLS.find((t) => t.function.name === n)!.function.description!.toLowerCase();
    assert.match(d, /only|confirm/, n);
  }
});
test("each customer journey has a save and a submit tool, and a human hand-off exists", () => {
  for (const n of ["save_registration_details", "submit_registration", "send_email_code", "save_requirement_details", "submit_requirement", "save_offer_details", "submit_offer", "human_help", "relay_to_other_party", "read_deal_terms", "track_shipment", "show_feature"]) assert.ok(names.includes(n), n);
});
test("the tool argument schemas carry unit and currency", () => {
  assert.match(src, /unit: z\.string\(\)/);
  assert.match(src, /currency: z\.string\(\)/);
});
