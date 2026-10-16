import { test } from "node:test";
import assert from "node:assert/strict";
import { createNcndaDraft } from "../src/deals/ncndaDraft.ts";
test("NCNDA keeps missing legal terms explicit and never claims execution or fees", () => {
 const text=createNcndaDraft({dealNumber:"UDC-1\nINJECTED",date:"17 October 2026"});
 assert.match(text,/UDC-1 INJECTED/);
 assert.match(text,/\[BUYER LEGAL NAME\]/);
 assert.match(text,/No penalty, damages amount or jurisdiction is assumed/);
 assert.match(text,/creates no automatic fee/);
 assert.match(text,/Not executed or signature-ready/);
});
