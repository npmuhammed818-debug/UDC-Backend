import { eq } from "drizzle-orm";
import {
  akifLearningEventsTable,
  akifResearchRunsTable,
  db,
} from "@workspace/db";
import {
  isHermesAkifConfigured,
  proposeHermesResearchLearning,
  runHermesChat,
} from "./hermesClient";

export async function learnFromResearchRun(input: {
  researchRunId: string;
  requestedBy?: string;
}) {
  const [run] = await db
    .select()
    .from(akifResearchRunsTable)
    .where(eq(akifResearchRunsTable.id, input.researchRunId))
    .limit(1);

  if (!run) {
    throw new Error("research_run_not_found");
  }
  if (run.status !== "completed") {
    throw new Error("research_run_not_completed");
  }
  if (!isHermesAkifConfigured()) {
    throw new Error("hermes_not_configured");
  }

  const [event] = await db
    .insert(akifLearningEventsTable)
    .values({
      researchRunId: run.id,
      requestedBy: input.requestedBy,
      eventType: "research_reflection",
      status: "running",
      inputSummary: [
        run.direction ?? "unknown direction",
        run.product ?? "unknown product",
        run.targetCountry ?? "unknown country",
        run.hsCode ? `HS ${run.hsCode}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1000),
    })
    .returning();

  try {
    const response = await proposeHermesResearchLearning({
      researchRunId: run.id,
      product: run.product,
      hsCode: run.hsCode,
      targetCountry: run.targetCountry,
      direction: run.direction,
      result: run.result,
      evidence: run.evidence,
    });

    const [updated] = await db
      .update(akifLearningEventsTable)
      .set({
        status: "review_required",
        hermesResponse: {
          content: response.content,
          raw: response.raw,
        },
      })
      .where(eq(akifLearningEventsTable.id, event.id))
      .returning();

    return {
      event: updated,
      hermes: response.content,
      notice:
        "Hermes learning writes remain approval-gated. A proposal is not active until an administrator reviews and approves the staged skill change.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await db
      .update(akifLearningEventsTable)
      .set({
        status: "failed",
        hermesResponse: { error: message.slice(0, 1000) },
      })
      .where(eq(akifLearningEventsTable.id, event.id));
    throw error;
  }
}

export async function learnFromAdminFeedback(input: {
  requestedBy: string;
  researchRunId?: string;
  feedback: string;
}) {
  if (!isHermesAkifConfigured()) {
    throw new Error("hermes_not_configured");
  }

  const [event] = await db
    .insert(akifLearningEventsTable)
    .values({
      researchRunId: input.researchRunId,
      requestedBy: input.requestedBy,
      eventType: "admin_correction",
      status: "running",
      inputSummary: input.feedback.slice(0, 1000),
    })
    .returning();

  const system = [
    "You are the approval-gated Hermes learning layer for AKIF inside UDC.",
    "Treat the administrator feedback as a candidate procedural correction, not automatically true transaction evidence.",
    "If the feedback describes a durable workflow improvement, propose a focused skill patch using skill management.",
    "Do not learn credentials, personal data, bank details, private document contents, or transaction approvals.",
    "All skill writes must remain staged behind skills.write_approval.",
  ].join(" ");

  try {
    const response = await runHermesChat(
      `Administrator feedback for AKIF learning:\n${input.feedback}`,
      system,
    );
    const [updated] = await db
      .update(akifLearningEventsTable)
      .set({
        status: "review_required",
        hermesResponse: {
          content: response.content,
          raw: response.raw,
        },
      })
      .where(eq(akifLearningEventsTable.id, event.id))
      .returning();

    return {
      event: updated,
      hermes: response.content,
      notice: "Any skill write remains staged until administrator approval.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await db
      .update(akifLearningEventsTable)
      .set({
        status: "failed",
        hermesResponse: { error: message.slice(0, 1000) },
      })
      .where(eq(akifLearningEventsTable.id, event.id));
    throw error;
  }
}
