import type {
  AkifOpportunityAssessment,
  AkifOpportunitySignals,
} from "./types";

const WEIGHTS = {
  demandStrength: 0.2,
  supplyStrength: 0.15,
  companyConfidence: 0.15,
  dataFreshness: 0.1,
  provenanceCoverage: 0.15,
  priceFit: 0.15,
  logisticsFit: 0.1,
} as const;

function validateSignal(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return value;
}

export function scoreOpportunity(
  signals: AkifOpportunitySignals,
): AkifOpportunityAssessment {
  const demandStrength = validateSignal(
    "demandStrength",
    signals.demandStrength,
  );
  const supplyStrength = validateSignal(
    "supplyStrength",
    signals.supplyStrength,
  );
  const companyConfidence = validateSignal(
    "companyConfidence",
    signals.companyConfidence,
  );
  const dataFreshness = validateSignal(
    "dataFreshness",
    signals.dataFreshness,
  );
  const provenanceCoverage = validateSignal(
    "provenanceCoverage",
    signals.provenanceCoverage,
  );
  const priceFit = validateSignal("priceFit", signals.priceFit ?? 0.5);
  const logisticsFit = validateSignal(
    "logisticsFit",
    signals.logisticsFit ?? 0.5,
  );
  const complianceRisk = validateSignal(
    "complianceRisk",
    signals.complianceRisk ?? 0,
  );

  const weighted =
    demandStrength * WEIGHTS.demandStrength +
    supplyStrength * WEIGHTS.supplyStrength +
    companyConfidence * WEIGHTS.companyConfidence +
    dataFreshness * WEIGHTS.dataFreshness +
    provenanceCoverage * WEIGHTS.provenanceCoverage +
    priceFit * WEIGHTS.priceFit +
    logisticsFit * WEIGHTS.logisticsFit;

  const riskPenalty = complianceRisk * 25;
  const score = Math.round(
    Math.max(0, Math.min(100, weighted * 100 - riskPenalty)),
  );

  const reasons: string[] = [];
  if (demandStrength >= 0.7) reasons.push("Strong demand evidence");
  if (supplyStrength >= 0.7) reasons.push("Strong supply evidence");
  if (priceFit >= 0.7) reasons.push("Price appears compatible with the target");
  if (logisticsFit >= 0.7) reasons.push("Logistics fit appears favorable");
  if (companyConfidence >= 0.7) {
    reasons.push("Company identity confidence is relatively strong");
  }
  if (provenanceCoverage >= 0.8) {
    reasons.push("Most important claims have source provenance");
  }
  if (reasons.length === 0) {
    reasons.push("Opportunity has mixed or incomplete supporting signals");
  }

  const warnings: string[] = [];
  if (provenanceCoverage < 0.6) {
    warnings.push("Source provenance is incomplete");
  }
  if (dataFreshness < 0.5) {
    warnings.push("Some evidence may be stale");
  }
  if (companyConfidence < 0.6) {
    warnings.push("Company identity requires more confirmation");
  }
  if (complianceRisk > 0.2) {
    warnings.push("Compliance signals require authorized human review");
  }

  const requiresHumanReview =
    provenanceCoverage < 0.6 ||
    companyConfidence < 0.6 ||
    complianceRisk > 0.2;

  const confidence: AkifOpportunityAssessment["confidence"] =
    provenanceCoverage >= 0.8 &&
    companyConfidence >= 0.8 &&
    dataFreshness >= 0.7
      ? "high"
      : provenanceCoverage >= 0.5 && companyConfidence >= 0.5
        ? "medium"
        : "low";

  return {
    score,
    confidence,
    requiresHumanReview,
    reasons,
    warnings,
  };
}
