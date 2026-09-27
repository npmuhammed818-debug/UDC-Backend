import { and, asc, eq } from "drizzle-orm";
import { akifResearchRunsTable, db } from "@workspace/db";
import { logger } from "../../lib/logger";
import { sendWhatsAppText } from "../../whatsapp/client";
import { runMarketResearch } from "./researchOrchestrator";

const POLL_MS = 15_000;
const BATCH_SIZE = 3;

let timer: NodeJS.Timeout | null = null;
let running = false;

function queryString(
  query: Record<string, unknown>,
  key: string,
): string | null {
  const value = query[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function deliverResearchStatus(
  run: typeof akifResearchRunsTable.$inferSelect,
  message: string,
) {
  const phone = queryString(run.query, "phone");
  if (!phone) return;

  try {
    const delivery = await sendWhatsAppText(phone, message);
    if (!delivery.delivered) {
      logger.error({ researchRunId: run.id, reason: delivery.reason }, "AKIF could not deliver research status to WhatsApp");
    }
  } catch (error) {
    logger.warn(
      { err: error, researchRunId: run.id },
      "AKIF could not deliver research status to WhatsApp",
    );
  }
}

async function processRun(run: typeof akifResearchRunsTable.$inferSelect) {
  if (
    !run.product ||
    !run.targetCountry ||
    (run.direction !== "buyer" && run.direction !== "seller")
  ) {
    await db
      .update(akifResearchRunsTable)
      .set({
        status: "needs_input",
        errorMessage: "queued_research_missing_structured_intent",
        completedAt: new Date(),
      })
      .where(eq(akifResearchRunsTable.id, run.id));
    return;
  }

  const [claimed] = await db
    .update(akifResearchRunsTable)
    .set({ status: "running", errorMessage: null })
    .where(
      and(
        eq(akifResearchRunsTable.id, run.id),
        eq(akifResearchRunsTable.status, "queued"),
      ),
    )
    .returning();

  if (!claimed) return;

  try {
    const result = await runMarketResearch({
      researchRunId: claimed.id,
      requestedBy: claimed.requestedBy ?? undefined,
      product: claimed.product!,
      targetCountry: claimed.targetCountry!,
      direction: claimed.direction as "buyer" | "seller",
    });

    const status = typeof result.status === "string" ? result.status : "completed";
    const message =
      status === "needs_input"
        ? `I need a bit more information to finish the search for ${claimed.product} in ${claimed.targetCountry}. Send me what you want to narrow down and I’ll continue.`
        : `Done. I finished the search for ${claimed.product} in ${claimed.targetCountry}. I kept company verification separate so nothing is treated as verified yet.`;

    await deliverResearchStatus(claimed, message);
  } catch (error) {
    logger.error(
      { err: error, researchRunId: claimed.id },
      "AKIF queued research failed",
    );
    await deliverResearchStatus(
      claimed,
      `I couldn’t finish the search for ${claimed.product} in ${claimed.targetCountry} right now. I kept the request and we can try again.`,
    );
  }
}

async function pollQueuedResearch() {
  if (running) return;
  running = true;

  try {
    const runs = await db
      .select()
      .from(akifResearchRunsTable)
      .where(eq(akifResearchRunsTable.status, "queued"))
      .orderBy(asc(akifResearchRunsTable.createdAt))
      .limit(BATCH_SIZE);

    for (const run of runs) {
      await processRun(run);
    }
  } catch (error) {
    logger.error({ err: error }, "AKIF research queue polling failed");
  } finally {
    running = false;
  }
}

export function startAkifResearchQueueRunner() {
  if (timer || process.env.AKIF_RESEARCH_QUEUE_ENABLED === "false") return;

  void pollQueuedResearch();
  timer = setInterval(() => void pollQueuedResearch(), POLL_MS);
  timer.unref();

  logger.info(
    { pollMs: POLL_MS, batchSize: BATCH_SIZE },
    "AKIF research queue runner started",
  );
}
