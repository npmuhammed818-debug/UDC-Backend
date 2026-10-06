const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 45_000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function openAITranscriptionConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
  };
}

export function isOpenAITranscriptionConfigured() {
  return openAITranscriptionConfig() !== null;
}

export async function transcribeAudio(
  bytes: Uint8Array,
  mimeType = "audio/ogg",
  timeoutMs = DEFAULT_TRANSCRIPTION_TIMEOUT_MS,
): Promise<string> {
  const config = openAITranscriptionConfig();
  if (!config) throw new Error("audio_transcription_not_configured");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("audio_size_not_supported");
  }

  const form = new FormData();
  const extension = mimeType.includes("mpeg") ? "mp3"
    : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a"
      : mimeType.includes("wav") ? "wav"
        : mimeType.includes("webm") ? "webm"
          : "ogg";
  const audioBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(audioBuffer).set(bytes);
  form.append("file", new Blob([audioBuffer], { type: mimeType }), `voice-note.${extension}`);
  form.append("model", config.model);

  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`audio_transcription_failed_http_${response.status}`);
  }

  const payload = await response.json() as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) throw new Error("audio_transcription_empty");
  return text;
}
