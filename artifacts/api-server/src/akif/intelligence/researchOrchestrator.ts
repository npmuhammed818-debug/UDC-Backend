import { eq } from "drizzle-orm";
import { akifResearchRunsTable, db } from "@workspace/db";
import { scoreOpportunity } from "./opportunityScoring";
import { unM49Code } from "./countryCodes";
import { isHermesAkifConfigured } from "./hermesClient";
import { learnFromResearchRun } from "./hermesLearning";
import {
  analyzeAkifMarket,
  analyzeAkifProduct,
  previewAkifComtrade,
} from "./workerClient";

export type RunResearchInput = {
  researchRunId?: string;
  requestedBy?: string;
  product: string;
  targetCountry: string;
  direction: "buyer" | "seller";
  period?: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export async function runMarketResearch(input: RunResearchInput) {
  let run;
  if (input.researchRunId) {
    const [existing] = await db.select().from(akifResearchRunsTable)
      .where(eq(akifResearchRunsTable.id, input.researchRunId)).limit(1);
    if (!existing) throw new Error("research_run_not_found");
    const [updated] = await db.update(akifResearchRunsTable)
      .set({
        status: "running",
        product: input.product,
        targetCountry: input.targetCountry,
        direction: input.direction,
        query: { ...existing.query, ...input },
        errorMessage: null,
        completedAt: null,
      })
      .where(eq(akifResearchRunsTable.id, existing.id))
      .returning();
    run = updated;
  } else {
    [run] = await db
      .insert(akifResearchRunsTable)
      .values({
        requestedBy: input.requestedBy,
        intent: "market_discovery",
        product: input.product,
        targetCountry: input.targetCountry,
        direction: input.direction,
        status: "running",
        query: input,
      })
      .returning();
  }

  try {
    const productInsight = await analyzeAkifProduct({
      product: input.product,
      destination_country: input.targetCountry,
      use_llm_fallback: true,
    });

    const hsCandidates = Array.isArray(productInsight.hs_candidates)
      ? productInsight.hs_candidates
      : [];
    const hsCode =
      typeof hsCandidates[0] === "object" &&
      hsCandidates[0] !== null &&
      typeof (hsCandidates[0] as Record<string, unknown>).code === "string"
        ? String((hsCandidates[0] as Record<string, unknown>).code)
        : null;

    const reporterCode = unM49Code(input.targetCountry);
    if (!hsCode || !reporterCode) {
      const result = {
        productInsight,
        status: "needs_input",
        missing: [
          ...(hsCode ? [] : ["confirmed_hs_code"]),
          ...(reporterCode ? [] : ["supported_target_country_or_reporter_code"]),
        ],
      };
      await db.update(akifResearchRunsTable)
        .set({
          hsCode,
          status: "needs_input",
          result,
          completedAt: new Date(),
        })
        .where(eq(akifResearchRunsTable.id, run.id));
      return { runId: run.id, ...result };
    }

    const period = input.period ?? String(new Date().getUTCFullYear() - 1);
    const flowCode = input.direction === "buyer" ? "M" : "X";
    const trade = await previewAkifComtrade({
      period,
      reporter_code: reporterCode,
      cmd_code: hsCode,
      flow_code: flowCode,
      frequency: "A",
      classification: "HS",
      max_records: 500,
    });

    const records = Array.isArray(trade.records) ? trade.records : [];
    const market = records.length
      ? await analyzeAkifMarket({ records })
      : {
          record_count: 0,
          total_trade_value: 0,
          total_net_weight: 0,
          periods: [],
          trend: "insufficient_data",
          concentration: {},
          warnings: ["UN Comtrade returned no records for this query."],
        };

    const totalValue = Number(market.total_trade_value ?? 0);
    const recordCount = Number(market.record_count ?? records.length);
    const trend = String(market.trend ?? "insufficient_data");

    const activitySignal = clamp(Math.log10(Math.max(1, totalValue)) / 10);
    const dataSignal = clamp(recordCount / 50);
    const trendSignal =
      trend === "increasing" ? 0.85 : trend === "stable" ? 0.65 : trend === "decreasing" ? 0.4 : 0.5;

    const assessment = scoreOpportunity({
      demandStrength: input.direction === "buyer" ? (activitySignal + trendSignal) / 2 : 0.5,
      supplyStrength: input.direction === "seller" ? (activitySignal + trendSignal) / 2 : 0.5,
      companyConfidence: 0.5,
      dataFreshness: 0.8,
      provenanceCoverage: 0.9,
      priceFit: 0.5,
      logisticsFit: 0.5,
      complianceRisk: 0,
    });

    const evidence = [
      {
        provider: "un_comtrade",
        sourceUrl: trade.source_url,
        retrievedAt: trade.retrieved_at,
        query: trade.query,
      },
    ];

    const result = {
      productInsight,
      tradeQuery: trade.query,
      market,
      opportunityAssessment: assessment,
      limitations: [
        "This research uses aggregate trade flows and does not identify individual companies.",
        "Company-level buyer/seller discovery requires an authorized company or shipment-data provider.",
      ],
    };

    await db.update(akifResearchRunsTable)
      .set({
        hsCode,
        status: "completed",
        result,
        evidence,
        completedAt: new Date(),
      })
      .where(eq(akifResearchRunsTable.id, run.id));

    let hermesLearning:
      | { attempted: false }
      | { attempted: true; status: "review_required" | "failed" } = {
      attempted: false,
    };

    if (
      process.env.AKIF_HERMES_AUTO_LEARN === "true" &&
      isHermesAkifConfigured()
    ) {
      try {
        await learnFromResearchRun({
          researchRunId: run.id,
          requestedBy: input.requestedBy,
        });
        hermesLearning = { attempted: true, status: "review_required" };
      } catch {
        hermesLearning = { attempted: true, status: "failed" };
      }
    }

    return {
      runId: run.id,
      status: "completed",
      ...result,
      evidence,
      hermesLearning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await db.update(akifResearchRunsTable)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 1000),
        completedAt: new Date(),
      })
      .where(eq(akifResearchRunsTable.id, run.id));
    throw error;
  }
}
