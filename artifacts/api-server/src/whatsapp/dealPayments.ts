import { db, dealFinancialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Payment steps in the deal room: the DLC status a participant asks about is
// read straight from the financial-instrument record UDC staff maintain -
// never written by the model. Amounts and terms belong to both deal parties.

export function paymentStatusQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /\b(?:payment|lc|letter of credit|dlc)\b/.test(t)
    && /\b(?:status|step|steps|stage|progress|confirmed|received|started|where|when|paid|release|released|setup|set up)\b/.test(t);
}

const DLC_STEPS = ["requested", "pending", "received", "confirmed"] as const;

function plainStatus(status: string): string {
  switch (status) {
    case "not_started": return "not started yet";
    case "requested": return "requested with the bank";
    case "pending": return "pending with the bank";
    case "received": return "received by the bank";
    case "confirmed": return "confirmed";
    case "rejected": return "rejected by the bank - UDC will review the next step with both sides";
    case "cancelled": return "cancelled";
    default: return status;
  }
}

export async function dealPaymentStatusReply(dealId: string): Promise<string> {
  const rows = await db
    .select({
      instrumentType: dealFinancialsTable.instrumentType,
      status: dealFinancialsTable.status,
      amount: dealFinancialsTable.amount,
      currency: dealFinancialsTable.currency,
      terms: dealFinancialsTable.terms,
    })
    .from(dealFinancialsTable)
    .where(eq(dealFinancialsTable.dealId, dealId));
  const dlc = rows.find((r) => r.instrumentType === "DLC");
  if (!dlc) {
    return "No payment instrument is recorded on this deal yet. UDC sets up the DLC step with both sides when the deal reaches banking.";
  }
  const stepIndex = (DLC_STEPS as readonly string[]).indexOf(dlc.status);
  const lines = [
    `Payment (DLC) is ${plainStatus(dlc.status)}${dlc.amount ? ` for ${dlc.currency} ${dlc.amount}` : ""}.`,
    stepIndex >= 0 ? `Step ${stepIndex + 1} of ${DLC_STEPS.length}: ${DLC_STEPS.map((s, i) => `${i + 1}. ${s}`).join("  ")}` : null,
    dlc.terms ? `Terms: ${dlc.terms}.` : null,
    "This is the recorded status only - the bank's own confirmation is what counts.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}
