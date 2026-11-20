// AKIF learns from corrections (phase 6, owner-approved 29 Oct: code only,
// no deploy). When an opted-in customer corrects AKIF, the correction is
// remembered privately in THEIR memory (never anyone else's) and is offered
// to the same one-way shared-learning door as any other note: generalized,
// safety-checked, or nothing. Detection is conservative on purpose - a false
// positive would turn an ordinary "no" into a fake lesson, which is the
// cheating the owner banned.
import { db } from "@workspace/db";
import { saveCustomerMemory } from "./customerMemory";

// Strong correction signals only: explicit "I meant / I said", "wrong",
// "that's not right", or a number replaced by another number.
export function looksLikeCorrection(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 500) return false;
  if (/\b(i meant|i said|correction)\b/i.test(t)) return true;
  if (/^(wrong|that'?s (wrong|not (right|correct|it)))\b/i.test(t)) return true;
  if (/\bnot \d+([.,]\d+)?\b.{0,40}\b\d+([.,]\d+)?\b/i.test(t) && /\b(i meant|should be|it'?s)\b/i.test(t)) return true;
  return false;
}

// The customer disputes something AKIF claimed from the shared lesson box.
// Narrow on purpose; ordinary disagreement in a negotiation is not a dispute
// about a lesson.
export function isLessonDispute(text: string): boolean {
  return /\b(that'?s not true|that is not true|that'?s wrong|that is wrong|you'?re wrong|you are wrong|wrong lesson)\b/i.test(
    text.trim(),
  );
}

// Remember one correction turn. The private save enforces the customer's
// opt-in; sharedLearner is the caller-provided door into shared lessons and
// its failure never blocks the private memory (customerMemory swallows it).
export async function handleCorrectionTurn(options: {
  userId: string;
  text: string;
  source: string;
  sharedLearner?: (input: { userId: string; topic: string; content: string }) => Promise<unknown>;
  confirm?: (text: string) => Promise<boolean>;
  database?: typeof db;
}): Promise<{ saved: boolean; id?: string; reason?: string }> {
  if (!looksLikeCorrection(options.text)) return { saved: false, reason: "no_correction_pattern" };
  if (options.confirm && !(await options.confirm(options.text))) return { saved: false, reason: "not_confirmed" };
  const memory = await saveCustomerMemory({
    userId: options.userId,
    kind: "correction",
    content: options.text.trim().slice(0, 500),
    source: options.source,
    database: options.database,
    sharedLearner: options.sharedLearner,
  });
  return { saved: true, id: memory?.id };
}
