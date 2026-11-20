import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

test("memory wiring: notes ride the brain payload as data, corrections are detected", async () => {
  const output = fileURLToPath(new URL(`./memory-wiring-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/profileIntakeConversation.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  try {
    const { buildIntakeUserPayload, detectCorrections } = await import(output);

    // No notes: payload unchanged from before (backwards compatible).
    const plain = JSON.parse(buildIntakeUserPayload({ message: "hi", role: "buyer", collected: { full_name: "Asha" } }));
    assert.deepEqual(Object.keys(plain).sort(), ["alreadyCollected", "message", "role"]);

    // Notes: present as customerNotes, clearly separate from the message.
    const withNotes = JSON.parse(buildIntakeUserPayload({ message: "hi", role: "buyer", collected: {}, memoryNotes: "Remembered customer facts:\n- (preference) \"prefers CIF\"" }));
    assert.equal(withNotes.customerNotes.includes("prefers CIF"), true);
    assert.equal(withNotes.message, "hi");

    // Corrections: only real changes, case-insensitive, never new fields.
    assert.deepEqual(detectCorrections({ full_name: "Asha", email: "old@x.com" }, { full_name: "Asha", email: "new@x.com" }),
      [{ field: "email", from: "old@x.com", to: "new@x.com" }]);
    assert.deepEqual(detectCorrections({ full_name: "Asha" }, { email: "new@x.com" }), []);
    assert.deepEqual(detectCorrections({ full_name: "Asha" }, { full_name: "asha" }), []);
    assert.deepEqual(detectCorrections({}, { full_name: "Asha" }), []);
  } finally {
    await unlink(output).catch(() => {});
  }
});
