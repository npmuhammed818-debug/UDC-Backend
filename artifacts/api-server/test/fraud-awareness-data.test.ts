import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The fraud-awareness training data teaches the brain to FLAG, never to
// approve. These checks keep every row de-identified and on-policy.
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../../docs/data/fraud-awareness-scenarios-v1.jsonl");

type Row = { id: string; messages: Array<{ role: string; content: string }> };
const rows: Row[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));

// Real names from the source review must never appear.
const FORBIDDEN = /vertex|j-?fie|rp infra|tirumal|arul raja|ogheneovo|7113229|666,?137|aadhaar/i;
// Approval or verdict words the assistant must never say.
const APPROVAL = /\b(approved?|safe to (pay|proceed)|you can pay|go ahead|deal is genuine|company is genuine|i confirm the company|verified and safe)\b/i;

test("fraud-awareness scenarios stay de-identified and flag-only", () => {
  assert.ok(rows.length >= 10, "expected at least 10 scenarios");
  for (const row of rows) {
    assert.ok(row.id && Array.isArray(row.messages), `${row.id}: shape`);
    assert.equal(row.messages[0].role, "system", `${row.id}: system first`);
    assert.ok(!FORBIDDEN.test(JSON.stringify(row)), `${row.id}: real identifier leaked`);
    const turns = row.messages.slice(1);
    assert.ok(turns.length >= 2, `${row.id}: at least one exchange`);
    for (let i = 0; i < turns.length; i++) {
      assert.equal(turns[i].role, i % 2 === 0 ? "user" : "assistant", `${row.id}: roles alternate`);
    }
    const replies = turns.filter((m) => m.role === "assistant");
    for (const reply of replies) {
      assert.ok(!APPROVAL.test(reply.content), `${row.id}: assistant approves something: ${reply.content.slice(0, 80)}`);
    }
    const last = replies.at(-1)!;
    // Every scenario lands on a check or a human route, never a verdict.
    assert.ok(
      /reviewer|human|bank|check|verify|confirm|റിവ്യൂവർ|ഹ്യൂമൻ|പരിശോധ|ബാങ്ക്/i.test(last.content),
      `${row.id}: final reply does not route to a check or human`,
    );
  }
  const languages = new Set(rows.map((r) => (/[\u0d00-\u0d7f]/.test(JSON.stringify(r)) ? "ml" : "en")));
  assert.ok(languages.has("ml"), "at least one Malayalam scenario");
});
