import { and, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, dbWrite, whatsappInboundDedupTable, whatsappWebhookReceiptsTable } from "@workspace/db";
import { fingerprintProviderMessage } from "./inboundDedup";

// Passive webhook diagnostic (staging-only flag, added 20 Nov): record WHERE a
// WhatsApp webhook or inbound message stops and the ERROR CLASS - never message
// content, phone numbers or provider ids. Everything here is inert unless
// UDC_WHATSAPP_DIAG_RECEIPTS=1, fail-silent (a diagnostic write must never break
// the ack path), and reply behavior/gates are untouched.

const RING_LIMIT = 50;
const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiagRingEntry {
  at: string;
  kind: string;
  stage?: string;
  errorClass?: string;
}

const ring: DiagRingEntry[] = [];
let receiptWriteFailures = 0;

export function diagReceiptsEnabled(): boolean {
  return process.env.UDC_WHATSAPP_DIAG_RECEIPTS === "1";
}

function pushRing(entry: DiagRingEntry): void {
  ring.push(entry);
  if (ring.length > RING_LIMIT) ring.splice(0, ring.length - RING_LIMIT);
}

// classes: "statuses" (delivery receipts only), "messages" (inbound only),
// "mixed" (both), "unknown" (no recognizable changes - still recorded, since an
// unexpected shape is itself diagnostic).
export function classifyWebhookPayload(body: unknown): { payloadClass: string; itemCount: number } {
  const entries = Array.isArray((body as { entry?: unknown[] } | undefined)?.entry)
    ? (body as { entry: Array<{ changes?: Array<{ value?: { statuses?: unknown[]; messages?: unknown[] } }> }> }).entry
    : [];
  let statuses = 0;
  let messages = 0;
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      if (Array.isArray(change?.value?.statuses)) statuses += change.value.statuses.length;
      if (Array.isArray(change?.value?.messages)) messages += change.value.messages.length;
    }
  }
  const payloadClass = statuses && messages ? "mixed" : statuses ? "statuses" : messages ? "messages" : "unknown";
  return { payloadClass, itemCount: statuses + messages };
}

// Bounded error class: SQLSTATE when present, else the error name. Never the
// message text (can carry identifiers or content).
export function errorClassOf(error: unknown): string {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | undefined)?.code
    ?? (error as { cause?: { code?: unknown } } | undefined)?.cause?.code;
  if (typeof code === "string" && code) return code.slice(0, 40);
  if (error instanceof Error) return error.name.slice(0, 40);
  return "unknown";
}

// One content-free receipt per POST, called from a finally AFTER the response is
// sent. A failed receipt write increments a counter and drops to the in-memory
// ring so a failing database (the very condition under diagnosis) cannot break
// the ack path or go entirely unnoticed.
export async function recordWebhookReceipt(input: { payloadClass: string; itemCount: number; handlerOutcome: string; signed: boolean }): Promise<void> {
  if (!diagReceiptsEnabled()) return;
  try {
    await dbWrite((wdb) => wdb.insert(whatsappWebhookReceiptsTable).values({
      payloadClass: input.payloadClass.slice(0, 20),
      itemCount: Math.max(0, Math.min(input.itemCount, 1000)),
      handlerOutcome: input.handlerOutcome.slice(0, 20),
      signed: input.signed,
    }));
  } catch (error) {
    receiptWriteFailures += 1;
    pushRing({ at: new Date().toISOString(), kind: "receipt_write_failed", errorClass: errorClassOf(error) });
  }
}

// Persist where a claimed inbound message stopped when the handler escaped
// before completion. Only unfinished claims are marked; a later successful
// redelivery clears the failure fields via completeInboundMessages.
export async function recordInboundFailure(messageIds: unknown[], stage: string, error: unknown): Promise<void> {
  if (!diagReceiptsEnabled()) return;
  const hashes = messageIds
    .filter((id): id is string => typeof id === "string" && id.length >= 6 && id.length <= 200)
    .map(fingerprintProviderMessage);
  if (!hashes.length) return;
  const errorClass = errorClassOf(error);
  try {
    await dbWrite((wdb) => wdb.update(whatsappInboundDedupTable)
      .set({ failedAt: new Date(), failedStage: stage.slice(0, 40), errorClass })
      .where(and(inArray(whatsappInboundDedupTable.idHash, hashes), isNull(whatsappInboundDedupTable.completedAt))));
  } catch (writeError) {
    receiptWriteFailures += 1;
    pushRing({ at: new Date().toISOString(), kind: "failure_row_write_failed", stage: stage.slice(0, 40), errorClass: errorClassOf(writeError) });
  }
}

// 7-day receipt retention, called from the webhook inbox runner tick. Best-effort:
// a purge failure waits for the next tick and is visible in the ring.
export async function purgeOldWebhookReceipts(now: Date = new Date()): Promise<void> {
  if (!diagReceiptsEnabled()) return;
  try {
    await dbWrite((wdb) => wdb.delete(whatsappWebhookReceiptsTable)
      .where(lt(whatsappWebhookReceiptsTable.receivedAt, new Date(now.getTime() - RECEIPT_RETENTION_MS))));
  } catch (error) {
    receiptWriteFailures += 1;
    pushRing({ at: new Date().toISOString(), kind: "receipt_purge_failed", errorClass: errorClassOf(error) });
  }
}

// Read-only snapshot for the admin database-health surface: the ring survives a
// failing database, so the last diagnostic events stay visible exactly when the
// persisted tables cannot be read.
export function diagSnapshot(): { enabled: boolean; receiptWriteFailures: number; ring: DiagRingEntry[] } {
  return { enabled: diagReceiptsEnabled(), receiptWriteFailures, ring: [...ring] };
}

export function resetWebhookDiagForTest(): void {
  ring.length = 0;
  receiptWriteFailures = 0;
}
