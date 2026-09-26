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
    await sendWhatsAppText(phone, message);
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
        ? `AKIF needs more information to finish research for ${claimed.product} in ${claimed.targetCountry}. Please review the research request in UDC.`
        : `AKIF completed market research for ${claimed.product} in ${claimed.targetCountry}. The result includes sourced trade evidence and opportunity analysis. Company discovery and verification remain separate checks.`;

    await deliverResearchStatus(claimed, message);
  } catch (error) {
    logger.error(
      { err: error, researchRunId: claimed.id },
      "AKIF queued research failed",
    );
    await deliverResearchStatus(
      claimed,
      `AKIF could not complete the research for ${claimed.product} in ${claimed.targetCountry}. The request has been kept for administrator review.`,
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
