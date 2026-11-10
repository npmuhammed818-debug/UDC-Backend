type WorkerRequestInit = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

// The worker token and chat content travel in request headers and bodies, so
// the worker URL must be https. Plain http is allowed only for loopback
// (local development); anything else is treated as not configured - fail closed.
export function workerUrlAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  );
}

function workerConfig() {
  const rawUrl = process.env.AKIF_WORKER_URL?.trim();
  const token = process.env.AKIF_WORKER_TOKEN?.trim();
  if (!rawUrl || !token || !workerUrlAllowed(rawUrl)) return null;
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

// Conversation text is private by default (deal, company, price, contact data). Only a caller that
// guarantees no such data may pass "generic"; the worker then may use Gemini without the data gate.
export async function runAkifWorkerChat(message: string, system?: string, timeoutMs = 15_000, sensitivity: "private" | "generic" = "private") {
  // Leave transport overhead within the caller's deadline; no retries at either layer.
  const budget = Math.max(1, Math.min(25_000, timeoutMs));
  const raw = await requestWorker<{
    choices?: Array<{ message?: { content?: string | null } }>;
  }>("/chat/completions", {
    method: "POST", timeoutMs: budget,
    body: {
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: message }],
      timeout_seconds: Math.max(1, Math.min(20, (budget - 1_000) / 1_000)),
      sensitivity: sensitivity === "generic" ? "generic" : "private",
    },
  });
  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("AKIF worker returned no text response");
  return { content, raw };
}


export function isAkifWorkerMediaEnabled() {
  return process.env.AKIF_WORKER_MEDIA_ENABLED === "true" && isAkifWorkerConfigured();
}

/** Fire-and-forget wake ping: free-tier Render suspends the worker, and a
 *  head start here is the difference between a warm transcription and a 429. */
export function warmAkifWorker(): void {
  const config = workerConfig();
  if (!config || !isAkifWorkerMediaEnabled()) return;
  void fetch(`${config.baseUrl}/capabilities`, { headers: { "x-akif-worker-token": config.token }, signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
}

let keepWarmStarted = false;
/** Free-tier Render suspends the worker after about 15 idle minutes. A light
 *  ping every 10 minutes keeps media paths (voice, image, TTS) warm while the
 *  API itself is alive; it cannot revive an already-suspended worker (the
 *  platform proxy 429s the ping), so the direct-STT fallback below stays the
 *  safety net for voice notes. */
export function startAkifWorkerKeepWarm(intervalMs = 10 * 60_000): void {
  if (keepWarmStarted || !isAkifWorkerMediaEnabled()) return;
  keepWarmStarted = true;
  const timer = setInterval(() => warmAkifWorker(), intervalMs);
  timer.unref();
}

export function transcribeAkifImage(input: { mime_type: string; base64: string }) {
  return requestWorker<{ text: string }>("/media/image/transcribe", {
    method: "POST", body: input, timeoutMs: 30_000,
  });
}

export async function transcribeAkifAudio(input: { bytes: Uint8Array; mimeType: string }) {
  return (await transcribeAkifAudioDetailed(input)).text;
}

// Render's free tier puts the worker to sleep; a cold start can take ~50s,
// past any single request timeout. Retry a timeout or network-level failure
// once with a longer budget. HTTP answers (401, 503, ...) are never retried:
// they are configuration or provider facts a retry cannot change.
async function withColdStartRetry<T>(call: (timeoutMs: number) => Promise<T>, firstTimeoutMs: number): Promise<T> {
  try {
    return await call(firstTimeoutMs);
  } catch (error) {
    const isTimeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    const isNetwork = error instanceof TypeError;
    if (!isTimeout && !isNetwork) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return call(60_000);
  }
}

// Direct-STT fallback (owner direction 10 Nov): the free-tier worker sleeps and
// the platform proxy answers 429 while it wakes (over a minute), which was
// losing live voice notes. When the worker path fails, transcribe straight from
// the API with the same providers and order the worker uses (ElevenLabs scribe,
// then Groq Whisper). Same audio bytes, same processors, no new third party.
function directSttEnabled(): boolean {
  return process.env.AKIF_AUDIO_DIRECT_STT !== "false";
}

function directSttConfigured(): boolean {
  return directSttEnabled() && Boolean(process.env.ELEVENLABS_API_KEY?.trim() || (process.env.AKIF_GROQ === "on" && process.env.GROQ_API_KEY?.trim()));
}

const ELEVENLABS_STT_MODELS = new Set(["scribe_v1", "scribe_v1_experimental", "scribe_v2"]);

async function transcribeDirectElevenLabs(bytes: Uint8Array, mimeType: string): Promise<{ text: string; language: string | null }> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const model = (process.env.ELEVENLABS_STT_MODEL_ID ?? "scribe_v1").trim();
  if (!key || !ELEVENLABS_STT_MODELS.has(model)) throw new Error("elevenlabs_stt_not_configured");
  const body = new FormData();
  body.set("model_id", model);
  body.set("tag_audio_events", "false");
  body.set("file", new Blob([bytes.buffer as ArrayBuffer], { type: mimeType.split(";")[0].toLowerCase() }), "voice");
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST", headers: { "xi-api-key": key }, body, signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`elevenlabs_http_${response.status}`);
  const payload = await response.json() as { text?: unknown; language_code?: unknown };
  if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("elevenlabs_empty");
  return { text: payload.text.trim().slice(0, 30_000), language: typeof payload.language_code === "string" ? payload.language_code : null };
}

// Groq Whisper reports ISO 639-1; the voice paths key language on 639-3.
const ISO_639_1_TO_3: Record<string, string> = { en: "eng", ml: "mal", ta: "tam", hi: "hin", ar: "ara" };

async function transcribeDirectGroq(bytes: Uint8Array, mimeType: string): Promise<{ text: string; language: string | null }> {
  // Groq is off everywhere (owner direction 10 Nov) unless AKIF_GROQ=on.
  const key = process.env.AKIF_GROQ === "on" ? process.env.GROQ_API_KEY?.trim() : undefined;
  if (!key) throw new Error("groq_not_configured");
  const base = mimeType.split(";")[0].toLowerCase();
  const suffix = ({ "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/webm": ".webm", "audio/wav": ".wav", "audio/flac": ".flac" } as Record<string, string>)[base] ?? ".mp3";
  const body = new FormData();
  body.set("model", "whisper-large-v3-turbo");
  body.set("response_format", "verbose_json");
  body.set("file", new Blob([bytes.buffer as ArrayBuffer], { type: base }), "voice" + suffix);
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { authorization: `Bearer ${key}` }, body, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`groq_http_${response.status}`);
  const payload = await response.json() as { text?: unknown; language?: unknown };
  if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("groq_empty");
  const lang = typeof payload.language === "string" ? payload.language.toLowerCase() : null;
  return { text: payload.text.trim().slice(0, 30_000), language: lang ? (ISO_639_1_TO_3[lang] ?? lang) : null };
}

async function transcribeAudioDirect(bytes: Uint8Array, mimeType: string): Promise<{ text: string; language: string | null }> {
  let firstError: unknown = null;
  for (const provider of ["elevenlabs", "groq"] as const) {
    try {
      const heard = provider === "elevenlabs" ? await transcribeDirectElevenLabs(bytes, mimeType) : await transcribeDirectGroq(bytes, mimeType);
      console.info(JSON.stringify({ event: "akif_audio_direct_stt_used", provider }));
      return heard;
    } catch (error) {
      if (firstError === null) firstError = error;
      // Never log audio, transcripts or keys: provider and error name only.
      console.warn(JSON.stringify({ event: "akif_audio_direct_provider_failed", provider, errorType: error instanceof Error ? error.name : "unknown" }));
    }
  }
  throw firstError instanceof Error ? firstError : new Error("akif_audio_direct_failed");
}

/** Transcript plus the detected language code (ISO 639-3 such as "mal" or "hin"), when the provider gives one. */
export async function transcribeAkifAudioDetailed(input: { bytes: Uint8Array; mimeType: string }): Promise<{ text: string; language: string | null }> {
  const config = workerConfig();
  if (!config || !isAkifWorkerMediaEnabled()) throw new Error("akif_audio_not_configured");
  if (!input.bytes.length || input.bytes.length > 10 * 1024 * 1024) throw new Error("akif_audio_too_large");
  const bytes = new Uint8Array(input.bytes.length); bytes.set(input.bytes);
  const body = new FormData();
  body.set("file", new Blob([bytes.buffer as ArrayBuffer], { type: input.mimeType }), "voice");
  const call = (timeoutMs: number) => fetch(`${config.baseUrl}/media/audio/transcribe`, {
    method: "POST", headers: { "x-akif-worker-token": config.token }, body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  try {
    let response = await withColdStartRetry(call, 25_000);
    // The free-tier worker answers 429 from the platform proxy while it wakes
    // from suspension; delayed retries ride out the wake window, which can take
    // over a minute. When the direct fallback is configured those waits only
    // slow the customer down, so a 429 falls back immediately. 503 stays an
    // immediate configuration fact (never retried).
    for (let attempt = 0; attempt < 2 && response.status === 429 && !directSttConfigured(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      response = await withColdStartRetry(call, 60_000);
    }
    if (!response.ok) throw new Error(`akif_audio_http_${response.status}`);
    const result = await response.json() as { text?: unknown; language?: unknown };
    if (typeof result.text !== "string" || !result.text.trim()) throw new Error("akif_audio_empty");
    return { text: result.text.trim().slice(0, 30_000), language: typeof result.language === "string" ? result.language : null };
  } catch (error) {
    if (!directSttConfigured()) throw error;
    const message = error instanceof Error ? error.message : "";
    const httpStatus = /(?:http|HTTP)_(\d{3})/.exec(message)?.[1];
    console.warn(JSON.stringify({ event: "akif_audio_worker_failed_direct_fallback", reason: httpStatus ? `http_${httpStatus}` : (error instanceof Error ? error.name : "unknown") }));
    return await transcribeAudioDirect(bytes, input.mimeType);
  }
}

/** Speech for short replies; conversational=true lets the worker apply its privacy rules instead of the fixed list. Returns OGG/Opus bytes. Worker enforces its own gates. */
export async function synthesizeAkifSpeech(text: string, conversational = false): Promise<Uint8Array> {
  return (await synthesizeAkifSpeechTimed(text, conversational)).bytes;
}

/** Same, plus the measured audio length in seconds from the worker (null if it could not measure). */
export type AkifSpeechStatus = { provider?: string; configured?: boolean; reason?: string; model?: string };

/** Worker speech configuration probe for operators. Returns null when the worker is unreachable. */
export async function fetchAkifSpeechStatus(): Promise<AkifSpeechStatus | null> {
  try {
    return await requestWorker<AkifSpeechStatus>("/speech/status", { method: "GET", timeoutMs: 8_000 });
  } catch {
    return null;
  }
}

export async function synthesizeAkifSpeechTimed(text: string, conversational = false, language = "english"): Promise<{ bytes: Uint8Array; seconds: number | null }> {
  const config = workerConfig();
  if (!config) {
    // No paid speech worker configured: use the free Edge neural voice when
    // enabled (owner direction, 10 Nov), else voice is simply unavailable.
    const { freeTtsEnabled, synthesizeFreeTts } = await import("../freeTts.ts");
    if (freeTtsEnabled()) {
      const { normalizeVoiceLanguage } = await import("../voiceLanguage.ts");
      return synthesizeFreeTts(text, normalizeVoiceLanguage(language) ?? "english");
    }
    throw new Error("akif_speech_not_configured");
  }
  try {
    const response = await withColdStartRetry((timeoutMs) => fetch(`${config.baseUrl}/speech/synthesize`, {
      method: "POST",
      headers: { "x-akif-worker-token": config.token, "content-type": "application/json" },
      body: JSON.stringify({ text, conversational, language }),
      signal: AbortSignal.timeout(timeoutMs),
    }), 30_000);
    if (!response.ok) throw new Error(`akif_speech_http_${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("akif_speech_size_invalid");
    const seconds = Number(response.headers.get("x-audio-seconds"));
    return { bytes, seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null };
  } catch (error) {
    // Paid worker failed: fall back to the free Edge voice when enabled so a
    // voice customer still gets voice (owner direction, 10 Nov).
    const { freeTtsEnabled, synthesizeFreeTts } = await import("../freeTts.ts");
    if (!freeTtsEnabled()) throw error;
    console.warn(JSON.stringify({ event: "akif_speech_worker_failed_free_fallback" }));
    const { normalizeVoiceLanguage } = await import("../voiceLanguage.ts");
    return synthesizeFreeTts(text, normalizeVoiceLanguage(language) ?? "english");
  }
}
