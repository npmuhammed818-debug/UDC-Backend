// AKIF learns from deal outcomes (phase 6, owner-approved 29 Oct: code only,
// no deploy). When a deal reaches a terminal status, ONE structural note is
// built from safe fields only - the status and the incoterm. Never parties,
// prices, quantities, routes, dates, or the deal number. Because the note is
// built from a fixed template it is already general, so no model rewrite is
// needed; the SAME safety check as chat lessons still runs, with the deal's
// own identifiers as forbidden terms. On staging the lesson is marked
// origin "practice" and recalled as "practice, not proven".
import { eq } from "drizzle-orm";
import { akifSharedLessonsTable, db, dealsTable } from "@workspace/db";
import { forbiddenTermsFrom, lessonSafetyCheck } from "./lessonSafety";

export const TERMINAL_DEAL_STATUSES = ["completed", "cancelled", "rejected", "disputed", "failed"] as const;

// Structural fields only. Adding a field here means re-checking it cannot
// identify a customer, a deal, or a counterparty.
export function dealOutcomeNote(deal: { status: string; incoterm: string | null }): string {
  const terms = deal.incoterm ? `under ${deal.incoterm} terms` : "under agreed terms";
  return `A deal ${terms} ended with status '${deal.status}'.`;
}

export async function learnFromDealOutcome(options: {
  dealId: string;
  database?: typeof db;
  now?: Date;
}): Promise<{ status: "approved" | "rejected" | "skipped"; id?: string; origin?: string; reason?: string; reasons?: string[] }> {
  const database = options.database ?? db;
  const [deal] = await database
    .select({ status: dealsTable.status, incoterm: dealsTable.incoterm, dealNumber: dealsTable.dealNumber })
    .from(dealsTable)
    .where(eq(dealsTable.id, options.dealId))
    .limit(1);
  if (!deal) return { status: "skipped", reason: "deal_not_found" };
  if (!(TERMINAL_DEAL_STATUSES as readonly string[]).includes(deal.status)) {
    return { status: "skipped", reason: "not_terminal" };
  }
  const note = dealOutcomeNote(deal);
  // Already general by construction; the shared safety check still runs so a
  // future template change cannot leak an identifier unnoticed.
  const check = lessonSafetyCheck(note, forbiddenTermsFrom("", [deal.dealNumber ?? ""]));
  if (!check.ok) return { status: "rejected", reasons: check.reasons };
  const origin = process.env.UDC_APP_ENV === "staging" ? "practice" : "real";
  const [lesson] = await database
    .insert(akifSharedLessonsTable)
    .values({
      topic: "deal_outcome",
      content: note,
      origin,
      status: "approved",
      reviewNote: "automatic: structural outcome, no identifiers by construction",
      reviewedAt: options.now ?? new Date(),
    })
    .returning({ id: akifSharedLessonsTable.id });
  return { status: "approved", id: lesson?.id, origin };
}
