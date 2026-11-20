import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Synthetic prompt-contract checks only. No model call and no message to anyone.
const src = await readFile(new URL("../src/akif/brainOrchestrator.ts", import.meta.url), "utf8");
const m = src.match(/PERSONAL DISTRESS:[^\n]*?(?=ROLE WORDS:)/);

test("system prompt carries a distress rule that precedes the role words rule", () => {
  assert.ok(m, "PERSONAL DISTRESS rule present");
});

test("distress rule forbids a trade pivot, diagnosis and medical advice", () => {
  const r = m![0];
  assert.match(r, /not an off topic request/);
  assert.match(r, /never mention UDC, import, export, trade/);
  assert.match(r, /never offer a service/);
  assert.match(r, /Do not diagnose/);
  assert.match(r, /medical advice/);
});

test("distress rule is hyphen and dash free and sits in the scope paragraph", () => {
  const r = m![0];
  assert.ok(!/[-\u2013\u2014]/.test(r));
  const scope = src.indexOf("SCOPE: you only help");
  assert.ok(scope >= 0 && src.indexOf("PERSONAL DISTRESS:") > scope);
});
