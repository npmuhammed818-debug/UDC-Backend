import { createHash } from "node:crypto";
import { eq, inArray, lt, sql, and, isNull } from "drizzle-orm";
import { db, whatsappInboundDedupTable } from "@workspace/db";
import { logger } from "../lib/logger";

// Durable claims are required before processing. Database errors (including a
// missing table) fail closed so the webhook can return 503 and Meta can retry.
// Never substitute a process-local cache for cross-instance replay protection.
const STALE_CLAIM_MS = 2 * 60_000;
const CLAIM_ATTEMPTS = 4;
const CLAIM_RETRY_DELAY_MS = 400;

export const fingerprintProviderMessage = (id: string) => createHash("sha256").update("wa-inbound:" + id).digest("hex");

export class InboundDedupUnavailable extends Error {
  constructor() { super("inbound_dedup_unavailable"); this.name = "InboundDedupUnavailable"; }
}

export async function claimInboundMessage(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || id.length < 6 || id.length > 200) return false;
  const hash = fingerprintProviderMessage(id);
  // A transient database blip (cold pooler connection, brief reconnect) must not
  // cost a customer their reply: retry the durable claim a few times before
  // failing closed. Still no process-local substitute for the durable claim.
  let lastCause: unknown;
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
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
      lastCause = error;
      if (attempt === CLAIM_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, CLAIM_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  // Keep the real database cause (for example a read-only session, SQLSTATE 25006) in a bounded,
  // redacted form so a repeated 503 is diagnosable. No message content, phone or id is logged.
  const cause = lastCause as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } } | undefined;
  const code = cause?.code ?? cause?.cause?.code;
  const message = String(cause?.cause?.message ?? cause?.message ?? "unknown")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, "[url]").slice(0, 160);
  logger.error({ flow: "whatsapp_inbound", reason: "dedup_claim_cause", sqlState: typeof code === "string" ? code.slice(0, 10) : undefined, cause: message, attempts: CLAIM_ATTEMPTS }, "Inbound claim failed after retries");
  throw new InboundDedupUnavailable();
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

/** True when this message has a fresh claim that nobody completed: a first delivery may still be running, or its process died.
 *  Either way a redelivery must not be acknowledged yet, or work lost to a restart is never retried. */
export async function inboundClaimInProgress(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || id.length < 6 || id.length > 200) return false;
  try {
    const rows = await db.select({ idHash: whatsappInboundDedupTable.idHash }).from(whatsappInboundDedupTable)
      .where(and(eq(whatsappInboundDedupTable.idHash, fingerprintProviderMessage(id)), isNull(whatsappInboundDedupTable.completedAt)));
    return rows.length > 0;
  } catch { return false; }
}
