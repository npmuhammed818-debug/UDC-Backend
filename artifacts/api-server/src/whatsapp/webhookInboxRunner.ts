import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { db, whatsappWebhookInboxTable } from "@workspace/db";

const POLL_MS = 15_000;
const GRACE_MS = 120_000;
const BATCH_SIZE = 10;

let started = false;
let running = false;

async function replayPendingWebhookInbox() {
  if (running) return;
  running = true;

  try {
    const cutoff = new Date(Date.now() - GRACE_MS);
    const rows = await db
      .select()
      .from(whatsappWebhookInboxTable)
      .where(and(
        isNull(whatsappWebhookInboxTable.processedAt),
        lt(whatsappWebhookInboxTable.receivedAt, cutoff),
      ))
      .orderBy(asc(whatsappWebhookInboxTable.receivedAt))
      .limit(BATCH_SIZE);

    const port = Number(process.env.PORT);
    if (!Number.isFinite(port) || port <= 0) return;

    for (const row of rows) {
      if (!row.signature) {
        await db.update(whatsappWebhookInboxTable)
          .set({ lastError: "missing_signature" })
          .where(eq(whatsappWebhookInboxTable.id, row.id));
        continue;
      }

      try {
        const body = Buffer.from(row.rawBodyBase64, "base64");
        const response = await fetch(
          `http://127.0.0.1:${port}/api/webhooks/whatsapp`,
          {
            method: "POST",
            headers: {
              "content-type": row.contentType ?? "application/json",
              "x-hub-signature-256": row.signature,
              "x-udc-replay-event-id": row.id,
            },
            body,
            signal: AbortSignal.timeout(30_000),
          },
        );

        await db.update(whatsappWebhookInboxTable)
          .set({
            forwardedAt: new Date(),
            forwardStatus: response.status,
            processedAt: response.ok ? new Date() : null,
            lastError: response.ok ? null : `replay_http_${response.status}`,
          })
          .where(eq(whatsappWebhookInboxTable.id, row.id));

        await response.body?.cancel();
      } catch (error) {
        await db.update(whatsappWebhookInboxTable)
          .set({
            lastError: error instanceof Error ? error.name : "replay_failed",
          })
          .where(eq(whatsappWebhookInboxTable.id, row.id))
          .catch(() => undefined);
      }
    }
  } finally {
    running = false;
  }
}

export function startWhatsAppWebhookInboxRunner() {
  if (started) return;
  started = true;

  void replayPendingWebhookInbox();
  const timer = setInterval(() => {
    void replayPendingWebhookInbox();
  }, POLL_MS);
  timer.unref();
}
