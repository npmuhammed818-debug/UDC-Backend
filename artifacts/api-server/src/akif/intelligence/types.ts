export type AkifSourceKind =
  | "official_trade_data"
  | "customs_data"
  | "company_website"
  | "sanctions_registry"
  | "news"
  | "user_provided";

export type AkifSourceEvidence = {
  sourceId: string;
  sourceName: string;
  kind: AkifSourceKind;
  url?: string;
  observedAt?: string;
  retrievedAt: string;
  fields: string[];
};

export type AkifCompanyCandidate = {
  externalId?: string;
  name: string;
  country?: string;
  website?: string;
  products?: string[];
  ports?: string[];
  evidence: AkifSourceEvidence[];
};

export type AkifResearchQuery = {
  product: string;
  targetCountry?: string;
  direction: "buyer" | "seller";
  hsCode?: string;
  limit?: number;
};

export type AkifResearchResult = {
  providerId: string;
  candidates: AkifCompanyCandidate[];
  searchedAt: string;
};

export interface AkifResearchProvider {
  readonly id: string;
  readonly displayName: string;
  searchCompanies(query: AkifResearchQuery): Promise<AkifResearchResult>;
}

export type AkifOpportunitySignals = {
  demandStrength: number;
  supplyStrength: number;
  companyConfidence: number;
  dataFreshness: number;
  provenanceCoverage: number;
  priceFit?: number;
  logisticsFit?: number;
  complianceRisk?: number;
};

export type AkifOpportunityAssessment = {
  score: number;
  confidence: "low" | "medium" | "high";
  requiresHumanReview: boolean;
  reasons: string[];
  warnings: string[];
};
