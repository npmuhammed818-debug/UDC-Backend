const DEFAULT_BASE_URL = "https://impexq.com/api/sandbox";
const DEFAULT_TIMEOUT_MS = 15_000;

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
    baseUrl:
      process.env.IMPEXQ_SANDBOX_BASE_URL?.trim() || DEFAULT_BASE_URL,
    verifiedCapabilities: [
      "hsn_classification",
      "rodtep",
      "fta_duty_rates",
      "cost_calculator",
    ],
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
    });

    const text = await response.text();
    let payload: unknown = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Preserve the provider response as text for diagnostics.
      }
    }

    if (!response.ok) {
      const error = new Error(
        `ImpexQ sandbox returned HTTP ${response.status}`,
      );
      Object.assign(error, {
        providerStatus: response.status,
        providerPayload: payload,
      });
      throw error;
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls the one sandbox path we have independently verified from the
 * ImpexQ sandbox material. The request body intentionally remains
 * pass-through until ImpexQ supplies the final production schema.
 *
 * This prevents AKIF from guessing field names or silently binding itself
 * to an undocumented buyer-data contract.
 */
export async function callImpexqHsnSandbox(
  payload: Record<string, unknown>,
) {
  const data = await requestImpexq<unknown>("/hsn", payload);

  return {
    provider: "impexq",
    mode: "sandbox",
    capability: "hsn_classification",
    retrievedAt: new Date().toISOString(),
    sourceUrl: `${
      process.env.IMPEXQ_SANDBOX_BASE_URL?.trim() || DEFAULT_BASE_URL
    }/hsn`,
    data,
    warnings: [
      "The sandbox HSN response is source evidence, not a final customs classification.",
      "AKIF does not call ImpexQ buyer-data endpoints until Enterprise API access and permitted-use terms are confirmed.",
    ],
  };
}
