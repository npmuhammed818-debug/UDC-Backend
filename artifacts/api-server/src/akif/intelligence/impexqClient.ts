import { z } from "zod/v4";

const DEFAULT_BASE_URL = "https://impexq.com/api/sandbox";
const DEFAULT_TIMEOUT_MS = 15_000;

const query = z.string().trim().min(2).max(500);
export const IMPEXQ_DESTINATIONS = [
  "uae",
  "australia",
  "uk",
  "eu_bloc",
  "efta",
  "canada",
  "oman",
  "mauritius",
  "sri_lanka",
  "singapore",
  "south_korea",
  "japan",
  "malaysia",
  "vietnam",
  "thailand",
  "indonesia",
  "philippines",
  "brunei",
  "cambodia",
  "laos",
  "myanmar",
  "peru",
  "chile",
  "israel",
  "maldives",
  "saudi_arabia",
  "usa",
  "china",
  "new_zealand",
] as const;
const destination = z.enum(IMPEXQ_DESTINATIONS);
const querySchema = z.object({ query }).strict();
const ftaSchema = z.object({ destination, query: query.optional() }).strict();
// Require an explicit INR per-unit CIF value; never accept the provider's
// silent default of 1000 for omitted/invalid values.
const calculatorSchema = z
  .object({
    query,
    cifValue: z.number().finite().positive(),
    destination: destination.optional(),
  })
  .strict();

const capabilities = {
  hsn: "hsn_classification",
  rodtep: "rodtep",
  fta: "fta_duty_rates",
  calculator: "cost_calculator",
} as const;
type ImpexqTool = keyof typeof capabilities;

function impexqConfig() {
  const apiKey = process.env.IMPEXQ_API_KEY?.trim();
  const baseUrl =
    process.env.IMPEXQ_SANDBOX_BASE_URL?.trim() || DEFAULT_BASE_URL;

  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
  };
}

export function isImpexqConfigured() {
  return impexqConfig() !== null;
}

export function getImpexqStatus() {
  return {
    configured: isImpexqConfigured(),
    mode: "sandbox",
    baseUrl: process.env.IMPEXQ_SANDBOX_BASE_URL?.trim() || DEFAULT_BASE_URL,
    verifiedCapabilities: [
      "hsn_classification",
      "rodtep",
      "fta_duty_rates",
      "cost_calculator",
    ],
    availableTools: Object.keys(capabilities),
    dataMode: {
      hsn: "mock",
      rodtep: "mock",
      calculator: "mock",
      fta: "provider_reference_data",
    },
    supportedDestinations: IMPEXQ_DESTINATIONS,
    calculatorCurrency: "INR",
    calculatorValueBasis: "per_unit_cif",
    productionReady: false,
    buyerDataStatus: "enterprise_access_required",
    requiredEnvironmentVariables: isImpexqConfigured()
      ? []
      : ["IMPEXQ_API_KEY"],
  };
}

async function requestImpexq<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const config = impexqConfig();
  if (!config) {
    throw new Error("IMPEXQ_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      const error = new Error(
        `ImpexQ sandbox returned HTTP ${response.status}`,
      );
      Object.assign(error, {
        providerStatus: response.status,
      });
      throw error;
    }

    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>)._sandbox !== true
    ) {
      throw new Error("ImpexQ returned an invalid sandbox response");
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Server-side sandbox tools. Responses must never become verified deal facts. */
export async function callImpexqSandbox(
  tool: ImpexqTool,
  payload: Record<string, unknown>,
) {
  const schema =
    tool === "fta"
      ? ftaSchema
      : tool === "calculator"
        ? calculatorSchema
        : querySchema;
  const input = schema.parse(payload);
  const data = await requestImpexq<Record<string, unknown>>(`/${tool}`, input);
  const mock = tool !== "fta" || data._mock !== false;

  return {
    provider: "impexq",
    mode: "sandbox",
    capability: capabilities[tool],
    retrievedAt: new Date().toISOString(),
    sourceUrl: `${process.env.IMPEXQ_SANDBOX_BASE_URL?.trim() || DEFAULT_BASE_URL}/${tool}`,
    mock,
    productionReady: false,
    ...(tool === "calculator"
      ? { currency: "INR", valueBasis: "per_unit_cif" }
      : {}),
    data,
    warnings: [
      mock
        ? "SANDBOX: simulated classification, rates or costs. Do not use for live quotes, customs filings or deal decisions."
        : "Provider FTA reference data only. Confirm current tariff eligibility, rules of origin and required certificates before use.",
      ...(typeof data._warning === "string" ? [data._warning] : []),
      ...(tool === "calculator"
        ? [
            "CIF input and calculated amounts are INR per unit. Port handling, storage and last-mile charges may be excluded.",
          ]
        : []),
      "Buyer-data access requires a separate Enterprise agreement.",
    ],
  };
}

export const callImpexqHsnSandbox = (payload: Record<string, unknown>) =>
  callImpexqSandbox("hsn", payload);
export const callImpexqRodtepSandbox = (payload: Record<string, unknown>) =>
  callImpexqSandbox("rodtep", payload);
export const callImpexqFtaSandbox = (payload: Record<string, unknown>) =>
  callImpexqSandbox("fta", payload);
export const callImpexqCalculatorSandbox = (payload: Record<string, unknown>) =>
  callImpexqSandbox("calculator", payload);
