// src/akif/memoryRanking.ts
function scoreMemoryRecall(rows, tokens, opts = {}) {
  const now = +(opts.now ?? /* @__PURE__ */ new Date());
  const activeDeal = opts.activeDeal ?? null;
  const kindWeight = (kind) => kind === "correction" ? 1.5 : kind === "preference" ? 1.2 : kind === "note" ? 0.9 : 1;
  const frequency = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = row.content.trim().toLowerCase();
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const content = row.content.toLowerCase();
    const relevance = tokens.filter((token) => content.includes(token)).reduce((sum, token) => sum + 1 + Math.min(token.length, 10) / 10, 0);
    const ageDays = Math.max(0, (now - +new Date(row.createdAt)) / 864e5);
    const recency = Math.pow(0.5, ageDays / 30);
    const reinforcement = Math.min(frequency.get(row.content.trim().toLowerCase()) ?? 1, 5) * 0.2;
    const score = relevance * 2 + recency + kindWeight(row.kind) + reinforcement + (activeDeal && row.dealId === activeDeal ? 4 : 0);
    return { row, score, relevance };
  }).filter((entry) => tokens.length === 0 || entry.relevance > 0).sort(
    (a, b) => b.score - a.score || +new Date(b.row.createdAt) - +new Date(a.row.createdAt)
  ).slice(0, opts.limit ?? 5).map((entry) => entry.row);
}
export {
  scoreMemoryRecall
};
