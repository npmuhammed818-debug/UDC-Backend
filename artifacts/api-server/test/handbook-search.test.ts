import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

test("handbook search: relevant sections ride the prompt, hard rules never drop", async () => {
  const output = fileURLToPath(new URL(`./handbook-search-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/udcHandbook.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  try {
    const { searchHandbook, udcHandbookForRole } = await import(output);

    // A payment question surfaces payment content and always the hard rules.
    const pay = searchHandbook("Is DLC a safe payment method for my shipment?", "buyer");
    assert.match(pay, /Documentary Letter of Credit/);
    assert.match(pay, /COMMISSION: Never state commission/);
    assert.match(pay, /NO APP/);
    assert.match(pay, /PERSONALITY AND SCOPE/);
    assert.doesNotMatch(pay, /DOCUMENT CHECKLISTS/);

    // A documents question surfaces the checklist, not the payment block.
    const docs = searchHandbook("Which documents do I need to upload as a seller?", "seller");
    assert.match(docs, /DOCUMENT CHECKLISTS/);
    assert.doesNotMatch(docs, /Documentary Letter of Credit/);

    // Retrieval miss falls back to the complete handbook - nothing hidden.
    assert.equal(searchHandbook("zzzz qqqq", "buyer"), udcHandbookForRole("buyer"));

    // Role split is preserved: agents never see buyer/seller document steps.
    const agent = searchHandbook("How do I register?", "agent");
    assert.match(agent, /AGENT user/);
    assert.doesNotMatch(agent, /trade-license PDF right away/);
  } finally {
    await unlink(output).catch(() => {});
  }
});
