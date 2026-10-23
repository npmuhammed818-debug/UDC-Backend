type WorkerRequestInit = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function workerConfig() {
  const rawUrl = process.env.AKIF_WORKER_URL?.trim();
  const token = process.env.AKIF_WORKER_TOKEN?.trim();
  if (!rawUrl || !token) return null;
  return { baseUrl: rawUrl.replace(/\/$/, ""), token };
}

export function isAkifWorkerConfigured() {
  return workerConfig() !== null;
}

async function requestWorker<T>(
  path: string,
  init: WorkerRequestInit = {},
): Promise<T> {
  const config = workerConfig();
  if (!config) {
    throw new Error("AKIF worker URL/token is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "x-akif-worker-token": config.token,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
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


export type AkifComtradePreviewInput = {
  period: string;
  reporter_code: string;
  cmd_code: string;
  flow_code: string;
  partner_code?: string;
  partner2_code?: string;
  customs_code?: string;
  mot_code?: string;
  frequency?: "A" | "M";
  classification?: string;
  max_records?: number;
};

export type AkifComtradePreviewResult = {
  provider: "un_comtrade";
  retrieved_at: string;
  source_url: string;
  query: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
};

export function previewAkifComtrade(input: AkifComtradePreviewInput) {
  return requestWorker<AkifComtradePreviewResult>("/trade/comtrade/preview", {
    method: "POST",
    body: input,
  });
}

export function analyzeAkifProduct(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/product/analyze", {
    method: "POST",
    body: input,
    timeoutMs: 25_000,
  });
}

export function analyzeAkifMarket(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/market/analyze", {
    method: "POST",
    body: input,
  });
}

export function calculateAkifLandedCost(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/economics/landed-cost", {
    method: "POST",
    body: input,
  });
}

export function assessAkifVerification(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/verification/assess", {
    method: "POST",
    body: input,
  });
}

export function compareAkifDocuments(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/documents/compare", {
    method: "POST",
    body: input,
  });
}

export function explainAkifTopic(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/learn/explain", {
    method: "POST",
    body: input,
    timeoutMs: 25_000,
  });
}

export function runAkifReasoning(input: Record<string, unknown>) {
  return requestWorker<Record<string, unknown>>("/reasoning/analyze", {
    method: "POST",
    body: input,
    // Specialist review performs three sequential, bounded 20-second model calls.
    timeoutMs: input.mode === "specialist_review" ? 70_000 : 25_000,
  });
}

export function searchAkifGleifCompany(input: {
  name: string;
  country_code?: string;
  limit?: number;
}) {
  return requestWorker<Record<string, unknown>>("/company/gleif/search", {
    method: "POST",
    body: input,
    timeoutMs: 25_000,
  });
}

export function screenAkifOfac(input: {
  name: string;
  threshold?: number;
  limit?: number;
}) {
  return requestWorker<Record<string, unknown>>("/compliance/ofac/screen", {
    method: "POST",
    body: input,
    timeoutMs: 45_000,
  });
}


export function isAkifWorkerConversationEnabled() {
  return process.env.AKIF_WORKER_CONVERSATION_ENABLED === "true" && isAkifWorkerConfigured();
}

export async function runAkifWorkerChat(message: string, system?: string, timeoutMs = 15_000) {
  // Leave transport overhead within the caller's deadline; no retries at either layer.
  const budget = Math.max(1, Math.min(25_000, timeoutMs));
  const raw = await requestWorker<{
    choices?: Array<{ message?: { content?: string | null } }>;
  }>("/chat/completions", {
    method: "POST", timeoutMs: budget,
    body: {
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: message }],
      timeout_seconds: Math.max(1, Math.min(20, (budget - 1_000) / 1_000)),
    },
  });
  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("AKIF worker returned no text response");
  return { content, raw };
}


export function isAkifWorkerMediaEnabled() {
  return process.env.AKIF_WORKER_MEDIA_ENABLED === "true" && isAkifWorkerConfigured();
}

export function transcribeAkifImage(input: { mime_type: string; base64: string }) {
  return requestWorker<{ text: string }>("/media/image/transcribe", {
    method: "POST", body: input, timeoutMs: 30_000,
  });
}

export async function transcribeAkifAudio(input: { bytes: Uint8Array; mimeType: string }) {
  const config = workerConfig();
  if (!config || !isAkifWorkerMediaEnabled()) throw new Error("akif_audio_not_configured");
  if (!input.bytes.length || input.bytes.length > 10 * 1024 * 1024) throw new Error("akif_audio_too_large");
  const bytes = new Uint8Array(input.bytes.length); bytes.set(input.bytes);
  const body = new FormData();
  body.set("file", new Blob([bytes.buffer], { type: input.mimeType }), "voice");
  const response = await fetch(`${config.baseUrl}/media/audio/transcribe`, {
    method: "POST", headers: { "x-akif-worker-token": config.token }, body,
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`akif_audio_http_${response.status}`);
  const result = await response.json() as { text?: unknown };
  if (typeof result.text !== "string" || !result.text.trim()) throw new Error("akif_audio_empty");
  return result.text.trim().slice(0, 30_000);
}
