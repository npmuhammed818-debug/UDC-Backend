import { createHash } from "node:crypto";
import { eq, inArray, lt, sql, and, isNull } from "drizzle-orm";
import { db, whatsappInboundDedupTable } from "@workspace/db";

// Claims a provider message id before it is processed. A second delivery of the same id (Meta retry, restart,
// another instance) is refused. A claim that never completed becomes reclaimable after 2 minutes so a crash
// cannot swallow a message. If the table does not exist yet (migration not approved/applied) the in-memory
// guard below is used, so behaviour is never worse than before.
const STALE_CLAIM_MS = 2 * 60_000;
const memory = new Map<string, number>();

export const fingerprintProviderMessage = (id: string) => createHash("sha256").update("wa-inbound:" + id).digest("hex");

function claimInMemory(hash: string, now = Date.now()) {
  for (const [key, at] of memory) { if (now - at > 15 * 60_000) memory.delete(key); else break; }
  if (memory.has(hash)) return false;
  if (memory.size >= 5000) memory.delete(memory.keys().next().value as string);
  memory.set(hash, now);
  return true;
}

const tableMissing = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "42P01" || e?.cause?.code === "42P01";
};

export async function claimInboundMessage(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || id.length < 6 || id.length > 200) return true;
  const hash = fingerprintProviderMessage(id);
  try {
    const claimed = await db.insert(whatsappInboundDedupTable).values({ idHash: hash })
      .onConflictDoUpdate({
        target: whatsappInboundDedupTable.idHash,
        set: { claimedAt: new Date() },
        setWhere: and(isNull(whatsappInboundDedupTable.completedAt), sql`${whatsappInboundDedupTable.claimedAt} < now() - make_interval(secs => ${STALE_CLAIM_MS / 1000})`),
      }).returning({ idHash: whatsappInboundDedupTable.idHash });
    if (Math.random() < 0.02) {
      await db.delete(whatsappInboundDedupTable).where(lt(whatsappInboundDedupTable.claimedAt, sql`now() - interval '7 days'`)).catch(() => undefined);
    }
    return claimed.length === 1;
  } catch (error) {
    if (tableMissing(error)) return claimInMemory(hash);
    // Unknown database trouble: do not drop the customer's message.
    return true;
  }
}

export async function completeInboundMessages(ids: unknown[]) {
  const hashes = ids.filter((x): x is string => typeof x === "string" && x.length >= 6 && x.length <= 200).map(fingerprintProviderMessage);
  if (!hashes.length) return;
  try { await db.update(whatsappInboundDedupTable).set({ completedAt: new Date() }).where(inArray(whatsappInboundDedupTable.idHash, hashes)); }
  catch { /* table missing or database unavailable: the stale-claim rule still protects retries */ }
}
