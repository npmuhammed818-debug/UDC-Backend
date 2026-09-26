type WorkerRequestInit = {
  method?: "GET" | "POST";
  body?: unknown;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function workerBaseUrl() {
  const value = process.env.AKIF_WORKER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

export function isAkifWorkerConfigured() {
  return workerBaseUrl() !== null;
}

async function requestWorker<T>(
  path: string,
  init: WorkerRequestInit = {},
): Promise<T> {
  const baseUrl = workerBaseUrl();
  if (!baseUrl) {
    throw new Error("AKIF_WORKER_URL is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AKIF worker returned HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export type AkifWorkerCapabilities = {
  service: string;
  capabilities: Record<string, unknown>;
  guardrails: Record<string, unknown>;
};

export type AkifEntityDedupeInput = {
  records: Array<{
    id: string;
    name: string;
    country?: string;
    website?: string;
    email?: string;
    phone?: string;
  }>;
  threshold?: number;
};

export type AkifEntityDedupeResult = {
  links: Array<{
    left_id: string;
    right_id: string;
    score: number;
    method: "splink" | "rapidfuzz";
    reasons: string[];
  }>;
  method: "splink" | "rapidfuzz";
  warnings: string[];
};

export function getAkifWorkerCapabilities() {
  return requestWorker<AkifWorkerCapabilities>("/capabilities");
}

export function dedupeAkifEntities(input: AkifEntityDedupeInput) {
  return requestWorker<AkifEntityDedupeResult>("/entities/dedupe", {
    method: "POST",
    body: input,
  });
}
