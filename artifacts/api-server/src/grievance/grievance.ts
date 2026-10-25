// Grievance handling: log, acknowledge at once, track a 48-hour response deadline.
export const ACK_WINDOW_MS = 48 * 60 * 60_000;

/** "complaint" / "grievance" as the first word, or a plain request to file one. */
export function isGrievance(text?: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t || t.length > 2000) return false;
  return /^(complaint|grievance)\b/.test(t) || /^(i want to|i would like to|i'd like to|please|let me|how do i)?\s*(file|make|raise|register|lodge)\s+(a\s+)?(complaint|grievance)\b/.test(t);
}

export function grievanceDeadline(receivedAt: Date) {
  return new Date(receivedAt.getTime() + ACK_WINDOW_MS);
}

export function acknowledgementReply(ref: string, dueAt: Date) {
  return `I have recorded your complaint (reference ${ref}). A UDC team member will review it and respond within 48 hours, by ${dueAt.toUTCString().replace(" GMT", " UTC")}. If you can, send one message describing what happened. Please don't send passwords, bank details or ID numbers here.`;
}

export const GRIEVANCE_PROMPT = "Please send your complaint in one message, starting with the word \"complaint\", and I will record it.";

export type GrievanceView = { id: string; receivedAt: string; dueAt: string; status: "open" | "responded" | "resolved"; overdue: boolean; ageHours: number; text: string };

export function grievanceStatus(received: Date, dueAt: Date, latest: "responded" | "resolved" | null, now = new Date()): Pick<GrievanceView, "status" | "overdue" | "ageHours"> {
  const status = latest ?? "open";
  return { status, overdue: status === "open" && now.getTime() > dueAt.getTime(), ageHours: Math.floor((now.getTime() - received.getTime()) / 3_600_000) };
}
