import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

test("hybrid memory ranking blends relevance, recency, kind and frequency", async () => {
  const output = fileURLToPath(new URL(`./hybrid-memory-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/memoryRanking.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  try {
    const { scoreMemoryRecall } = await import(output); const memoryQueryTokens = (q) => q.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2);
    const now = new Date("2026-10-30T00:00:00Z");
    const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString();
    const mem = (kind, content, age, dealId = null) => ({ kind, content, createdAt: daysAgo(age), dealId });
    const tokens = memoryQueryTokens("cocoa price");

    // Relevance: the cocoa memory beats an unrelated fresh one.
    const [top1] = scoreMemoryRecall(
      [mem("note", "likes small talk", 1), mem("fact", "asked about cocoa price", 40)],
      tokens, { now });
    assert.match(top1.content, /cocoa/);

    // Kind: a correction outranks a preference with equal relevance.
    const [top2] = scoreMemoryRecall(
      [mem("preference", "prefers cocoa CIF", 5), mem("correction", "cocoa quantity corrected to 100 MT", 5)],
      tokens, { now });
    assert.equal(top2.kind, "correction");

    // Recency: equal relevance and kind, the fresher memory wins.
    const [top3] = scoreMemoryRecall(
      [mem("fact", "cocoa buyer", 90), mem("fact", "cocoa seller", 2)],
      tokens, { now });
    assert.match(top3.content, /seller/);

    // Frequency: repeated content reinforces itself past a single fresher note.
    const repeated = mem("fact", "cocoa destination Cochin", 10);
    const [top4] = scoreMemoryRecall(
      [mem("fact", "cocoa destination Cochin", 10), repeated, mem("fact", "cocoa destination Cochin", 12), mem("fact", "cocoa packaging bags", 2)],
      tokens, { now });
    assert.match(top4.content, /Cochin/);

    // Guardrails: no token match returns nothing; limit is honored.
    assert.equal(scoreMemoryRecall([mem("fact", "unrelated", 1)], ["cocoa"], { now }).length, 0);
    assert.equal(scoreMemoryRecall([mem("fact", "cocoa a", 1), mem("fact", "cocoa b", 1), mem("fact", "cocoa c", 1)], tokens, { now, limit: 2 }).length, 2);
  } finally {
    await unlink(output).catch(() => {});
  }
});
