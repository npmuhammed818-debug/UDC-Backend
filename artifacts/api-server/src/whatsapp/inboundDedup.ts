import { createHash } from "node:crypto";
import { eq, inArray, lt, sql, and, isNull } from "drizzle-orm";
import { db, whatsappInboundDedupTable } from "@workspace/db";

// Durable claims are required before processing. Database errors (including a
// missing table) fail closed so the webhook can return 503 and Meta can retry.
// Never substitute a process-local cache for cross-instance replay protection.
const STALE_CLAIM_MS = 2 * 60_000;

export const fingerprintProviderMessage = (id: string) => createHash("sha256").update("wa-inbound:" + id).digest("hex");

export class InboundDedupUnavailable extends Error {
  constructor() { super("inbound_dedup_unavailable"); this.name = "InboundDedupUnavailable"; }
}

export async function claimInboundMessage(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || id.length < 6 || id.length > 200) return false;
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
  } catch {
    throw new InboundDedupUnavailable();
  }
}

export async function completeInboundMessages(ids: unknown[]) {
  const hashes = ids.filter((x): x is string => typeof x === "string" && x.length >= 6 && x.length <= 200).map(fingerprintProviderMessage);
  if (!hashes.length) return;
  try { await db.update(whatsappInboundDedupTable).set({ completedAt: new Date() }).where(inArray(whatsappInboundDedupTable.idHash, hashes)); }
  catch { /* table missing or database unavailable: the stale-claim rule still protects retries */ }
}

// Release claims whose reply could not be delivered, so a Meta redelivery is processed again instead of being
// treated as done. Only unfinished claims are deleted.
export async function releaseInboundMessages(ids: unknown[]) {
  const hashes = ids.filter((x): x is string => typeof x === "string" && x.length >= 6 && x.length <= 200).map(fingerprintProviderMessage);
  if (!hashes.length) return;
  try { await db.delete(whatsappInboundDedupTable).where(and(inArray(whatsappInboundDedupTable.idHash, hashes), isNull(whatsappInboundDedupTable.completedAt))); }
  catch { /* An unfinished durable claim becomes retryable after the stale-claim window. */ }
}
