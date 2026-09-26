import type { getAkifDealContext } from "./dealContext";

type DealContext = NonNullable<Awaited<ReturnType<typeof getAkifDealContext>>>;

export type DealRiskFlag = {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
};

const TERMINAL = new Set(["completed", "cancelled", "rejected"]);

export function assessDealRisks(context: DealContext, now = new Date()) {
  const flags: DealRiskFlag[] = [];

  if (context.deal.status === "disputed") {
    flags.push({
      severity: "critical",
      code: "deal_disputed",
      message: "The deal is currently marked as disputed.",
    });
  }

  for (const inspection of context.inspections) {
    if (inspection.status === "failed") {
      flags.push({
        severity: "critical",
        code: "inspection_failed",
        message: "An inspection is marked failed and requires human review.",
      });
    }
  }

  for (const financial of context.financials) {
    if (financial.status === "rejected" || financial.status === "cancelled") {
      flags.push({
        severity: "critical",
        code: "financial_instrument_problem",
        message: `${financial.instrumentType} is marked ${financial.status}.`,
      });
    }
  }

  for (const shipment of context.shipments) {
    if (
      shipment.estimatedArrival &&
      shipment.estimatedArrival.getTime() < now.getTime() &&
      !["arrived", "delivered", "cancelled"].includes(shipment.status)
    ) {
      flags.push({
        severity: "warning",
        code: "shipment_eta_passed",
        message: "A shipment ETA has passed without an arrived/delivered status.",
      });
    }
  }

  if (!TERMINAL.has(context.deal.status)) {
    const ageMs = now.getTime() - context.deal.updatedAt.getTime();
    const staleDays = ageMs / 86_400_000;
    if (staleDays >= 14) {
      flags.push({
        severity: "warning",
        code: "deal_stale",
        message: `No deal update has been recorded for about ${Math.floor(staleDays)} days.`,
      });
    }
  }

  if (flags.length === 0) {
    flags.push({
      severity: "info",
      code: "no_rule_based_alerts",
      message: "No rule-based AKIF deal alert is currently active.",
    });
  }

  return flags;
}
