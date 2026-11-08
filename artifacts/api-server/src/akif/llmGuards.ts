// Cost and runaway-loop guards for the AKIF brain (owner-approved 8 Nov).
// In-memory like voiceLimits: buckets reset on API restart, so these are
// coarse safety rails, not billing. All limits env-tunable.
//
// Four guards:
// 1. per-phone message rate (default 30 brain turns / rolling hour)
// 2. global daily LLM-call counter (default 400 / UTC day)
// 3. per-phone in-flight guard (one brain turn per customer at a time)
// 4. global LLM concurrency semaphore (default 8 simultaneous chat calls)
import { createHash } from "node:crypto";

function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const llmGuardDefaults = { msgsPerHourPerPhone: 30, dailyLlmCallCap: 400, maxConcurrentLlm: 8 };

const key = (phone: string) => createHash("sha256").update(phone).digest("hex").slice(0, 16);

type HourBucket = { hour: string; count: number };
const phoneHour = new Map<string, HourBucket>();

type DayBucket = { day: string; count: number };
let llmDay: DayBucket = { day: "", count: 0 };

const inFlight = new Set<string>();
let activeLlmCalls = 0;

const hourStamp = (now: Date) => now.toISOString().slice(0, 13);
const dayStamp = (now: Date) => now.toISOString().slice(0, 10);

export type GuardVerdict = "ok" | "rate_limited" | "daily_cap" | "already_in_flight" | "llm_busy";

// Guard 1+3, evaluated before any work for an inbound message.
export function admitBrainTurn(phone: string, now: Date = new Date()): GuardVerdict {
  const k = key(phone);
  if (inFlight.has(k)) return "already_in_flight";
  const perHour = limit("AKIF_MAX_MSGS_PER_HOUR", llmGuardDefaults.msgsPerHourPerPhone);
  const bucket = phoneHour.get(k);
  const stamp = hourStamp(now);
  const count = bucket && bucket.hour === stamp ? bucket.count : 0;
  if (count >= perHour) return "rate_limited";
  phoneHour.set(k, { hour: stamp, count: count + 1 });
  inFlight.add(k);
  return "ok";
}

export function finishBrainTurn(phone: string): void {
  inFlight.delete(key(phone));
}

// Guard 2+4, wrapped around each actual LLM call inside a turn.
export function admitLlmCall(now: Date = new Date()): GuardVerdict {
  const cap = limit("AKIF_DAILY_LLM_CALL_CAP", llmGuardDefaults.dailyLlmCallCap);
  const stamp = dayStamp(now);
  const count = llmDay.day === stamp ? llmDay.count : 0;
  if (count >= cap) return "daily_cap";
  const maxConc = limit("AKIF_MAX_CONCURRENT_LLM", llmGuardDefaults.maxConcurrentLlm);
  if (activeLlmCalls >= maxConc) return "llm_busy";
  llmDay = { day: stamp, count: count + 1 };
  activeLlmCalls += 1;
  return "ok";
}

export function finishLlmCall(): void {
  activeLlmCalls = Math.max(0, activeLlmCalls - 1);
}

// Test-only: reset all in-memory state.
export function resetLlmGuards(): void {
  phoneHour.clear();
  inFlight.clear();
  llmDay = { day: "", count: 0 };
  activeLlmCalls = 0;
}
