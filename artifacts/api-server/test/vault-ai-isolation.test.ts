import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// Privacy Policy claim: raw vault documents never reach the AI model.
test("AI and AKIF code never import or read the vault", async () => {
  const dirs = ["../src/akif", "../src/akif/intelligence"];
  for (const d of dirs) {
    for (const f of await readdir(new URL(`${d}/`, import.meta.url)).catch(() => [] as string[])) {
      if (!f.endsWith(".ts")) continue;
      const src = await readFile(new URL(`${d}/${f}`, import.meta.url), "utf8");
      assert.ok(!/from\s+["'][^"']*\/vault\//.test(src), `${d}/${f} imports the vault`);
      assert.ok(!/vaultDocuments|vault_documents|vaultDocumentsTable/.test(src), `${d}/${f} reads vault tables`);
    }
  }
});
test("vault bucket and signed reads are not reachable from model routes", async () => {
  const r = await readFile(new URL("../src/routes/akifIntelligence.ts", import.meta.url), "utf8");
  assert.ok(!/vault/i.test(r));
});
