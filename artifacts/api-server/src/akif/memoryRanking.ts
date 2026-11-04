// Hybrid memory ranking (Phase 9 item 5a, mem0-style, no schema change):
// every memory is scored on four signals and the mix decides what the brain
// sees, instead of plain substring count.
//   1. relevance  - query token overlap, longer (rarer) tokens weigh more
//   2. recency    - exponential decay, ~30 day half-life
//   3. kind       - a correction outranks a preference, which outranks a note
//   4. frequency  - content the customer repeated reinforces itself
export function scoreMemoryRecall<T extends { kind: string; content: string; dealId: string | null; createdAt: string | Date }>(
  rows: T[],
  tokens: string[],
  opts: { activeDeal?: string | null; limit?: number; now?: Date } = {},
): T[] {
  const now = +(opts.now ?? new Date());
  const activeDeal = opts.activeDeal ?? null;
  const kindWeight = (kind: string) =>
    kind === "correction" ? 1.5 : kind === "preference" ? 1.2 : kind === "note" ? 0.9 : 1;
  const frequency = new Map<string, number>();
  for (const row of rows) {
    const key = row.content.trim().toLowerCase();
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  return rows
    .map((row) => {
      const content = row.content.toLowerCase();
      const relevance = tokens
        .filter((token) => content.includes(token))
        .reduce((sum, token) => sum + 1 + Math.min(token.length, 10) / 10, 0);
      const ageDays = Math.max(0, (now - +new Date(row.createdAt)) / 86_400_000);
      const recency = Math.pow(0.5, ageDays / 30);
      const reinforcement = Math.min(frequency.get(row.content.trim().toLowerCase()) ?? 1, 5) * 0.2;
      const score =
        relevance * 2 +
        recency +
        kindWeight(row.kind) +
        reinforcement +
        (activeDeal && row.dealId === activeDeal ? 4 : 0);
      return { row, score, relevance };
    })
    .filter((entry) => tokens.length === 0 || entry.relevance > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        +new Date(b.row.createdAt) - +new Date(a.row.createdAt),
    )
    .slice(0, opts.limit ?? 5)
    .map((entry) => entry.row);
}
