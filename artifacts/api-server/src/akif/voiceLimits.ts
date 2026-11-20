// Per-user daily cost guards for voice. In memory: they reset when the API restarts, so the worker
// keeps its own global daily cap as a second layer. Keys are hashed, no phone numbers are stored.
import { createHash } from "node:crypto";

type Bucket = { day: string; sttCount: number; ttsCount: number; ttsChars: number };
const buckets = new Map<string, Bucket>();

export const voiceLimitDefaults = { sttPerDay: 30, ttsPerDay: 20, ttsCharsPerDay: 6000 };

function limit(name: string, fallback: number, env: Record<string, string | undefined>) {
  const n = Number(env[name]);
  return Number.isFinite(n) && n >= 0 && env[name] !== undefined && env[name] !== "" ? Math.floor(n) : fallback;
}

function bucketFor(phone: string, now: Date): Bucket {
  const key = createHash("sha256").update(phone).digest("hex").slice(0, 24);
  const day = now.toISOString().slice(0, 10);
  let bucket = buckets.get(key);
  if (!bucket || bucket.day !== day) { bucket = { day, sttCount: 0, ttsCount: 0, ttsChars: 0 }; buckets.set(key, bucket); }
  if (buckets.size > 20_000) for (const [k, v] of buckets) if (v.day !== day) buckets.delete(k);
  return bucket;
}

/** Reserve one transcription. False when the user hit today's limit. */
export function reserveTranscription(phone: string, env: Record<string, string | undefined> = process.env, now = new Date()): boolean {
  const bucket = bucketFor(phone, now);
  if (bucket.sttCount >= limit("AKIF_VOICE_STT_PER_USER_DAILY", voiceLimitDefaults.sttPerDay, env)) return false;
  bucket.sttCount += 1;
  return true;
}

/** Reserve one spoken reply of this length. False when either daily limit would be exceeded. */
export function reserveSpeech(phone: string, chars: number, env: Record<string, string | undefined> = process.env, now = new Date()): boolean {
  const bucket = bucketFor(phone, now);
  if (bucket.ttsCount >= limit("AKIF_VOICE_TTS_PER_USER_DAILY", voiceLimitDefaults.ttsPerDay, env)) return false;
  if (bucket.ttsChars + chars > limit("AKIF_VOICE_TTS_CHARS_PER_USER_DAILY", voiceLimitDefaults.ttsCharsPerDay, env)) return false;
  bucket.ttsCount += 1; bucket.ttsChars += chars;
  return true;
}

export function resetVoiceLimitsForTests() { buckets.clear(); }
