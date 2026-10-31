import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

test("indic pack: language-mismatch detection decides the one retry", async () => {
  const output = fileURLToPath(new URL(`./indic-pack-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({
    stdin: {
      contents: "export { intakeRejectWasLanguageMismatch } from '../src/akif/profileIntakeConversation';",
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{
      name: "stubs",
      setup(b) {
        for (const [filter, code] of [
          [/^@workspace\/db$/, "export const db = {};"],
          [/hermesClient/, "export const runConversationChat = async () => ({ content: '{}' });"],
        ]) b.onResolve({ filter }, (_a, _b, _c, resolveData) => ({ path: String(filter), namespace: "stub", pluginData: { resolveData } }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: a.path.includes("db") ? "export const db = {};" : "export const runConversationChat = async () => ({ content: '{}' });" }));
      },
    }],
  });
  await writeFile(output, result.outputFiles[0].text);
  try {
    const { intakeRejectWasLanguageMismatch } = await import(output);
    const malayalam = "എന്റെ പേര് അനിൽ ആണ്, കൊച്ചിയിൽ നിന്ന് കോക്കോ ഇറക്കുമതി ചെയ്യുന്നു";

    // English reply to a Malayalam customer: retry.
    assert.equal(intakeRejectWasLanguageMismatch(JSON.stringify({ fields: {}, requirements: {}, reply: "Nice to meet you Anil! What is your email?" }), malayalam), true);
    // Malayalam reply to a Malayalam customer: no retry.
    assert.equal(intakeRejectWasLanguageMismatch(JSON.stringify({ fields: {}, requirements: {}, reply: "നമസ്കാരം അനിൽ! നിങ്ങളുടെ ഇമെയിൽ അറിയാമോ?" }), malayalam), false);
    // Bad JSON, missing reply, English customer: never retry.
    assert.equal(intakeRejectWasLanguageMismatch("not json", malayalam), false);
    assert.equal(intakeRejectWasLanguageMismatch(JSON.stringify({ fields: {} }), malayalam), false);
    assert.equal(intakeRejectWasLanguageMismatch(JSON.stringify({ fields: {}, requirements: {}, reply: "Could you share your company name?" }), "My name is Anil"), false);
  } finally {
    await unlink(output).catch(() => {});
  }
});
