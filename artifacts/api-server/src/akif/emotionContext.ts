// AKIF emotional context (phase 5, owner-approved 29 Oct). Two separate
// things, honestly kept apart:
//   1. A GUESS at the customer's feelings - probabilistic, confidence carried,
//      never from stereotypes, never stored long-term.
//   2. AKIF's OWN feeling state - persistent per relationship, fading
//      naturally toward a calm baseline (excitement in hours, grief in
//      weeks), never auto-deleted, never capped, never scripted.
// Feelings color manner only. Facts, deal terms, approvals and safety never
// depend on any mood, and feelings must never pressure a customer to stay,
// return or transact. AKIF never claims to be human.
import { eq } from "drizzle-orm";
import { akifEmotionalStatesTable, db } from "@workspace/db";
import { runCheapModelChat } from "./intelligence/cheapModel";
import { EMOTION_CUES } from "./emotionNotes";

export type CustomerEmotionGuess = {
  valence: "positive" | "neutral" | "negative" | "unknown";
  cues: string[];
  confidence: number; // 0..1, always carried
  evidence: string; // short quote or ""
};

const UNKNOWN_GUESS: CustomerEmotionGuess = {
  valence: "unknown",
  cues: [],
  confidence: 0,
  evidence: "",
};

type DetectFn = (input: { history: Array<{ role: string; content: string }>; currentMessage: string }) => Promise<string>;

const DETECT_SYSTEM =
  "Estimate the customer's emotional state from the conversation. Reply with ONLY a JSON object: {\"valence\":\"positive|neutral|negative\",\"cues\":[...],\"confidence\":0..1,\"evidence\":\"short quote\"}. Allowed cues: happiness, sadness, anger, fear, confusion, urgency, relief, curiosity, trust, distrust, neutral. Reading emotion from text is always uncertain; keep confidence honest and low when unsure. Never infer from demographics or stereotypes.";

const defaultDetect: DetectFn = async ({ history, currentMessage }) => {
  const response = await runCheapModelChat(
    JSON.stringify({ history: history.slice(-10), currentMessage }),
    DETECT_SYSTEM,
    20000,
  );
  return response.content.trim();
};

// Parse and strictly validate the model's guess. Any failure is an honest
// "unknown" - never an invented emotion.
export function parseEmotionGuess(raw: string): CustomerEmotionGuess {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return UNKNOWN_GUESS;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const valence = ["positive", "neutral", "negative"].includes(String(parsed.valence))
      ? (parsed.valence as CustomerEmotionGuess["valence"])
      : "unknown";
    const cues = (Array.isArray(parsed.cues) ? parsed.cues : [])
      .map((cue) => String(cue).toLowerCase())
      .filter((cue) => EMOTION_CUES.some((known) => known.startsWith(cue)));
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
    const evidence = String(parsed.evidence ?? "").slice(0, 200);
    if (valence === "unknown") return { ...UNKNOWN_GUESS, confidence };
    return { valence, cues, confidence, evidence };
  } catch {
    return UNKNOWN_GUESS;
  }
}

export async function estimateCustomerEmotion(options: {
  history: Array<{ role: string; content: string }>;
  currentMessage: string;
  detect?: DetectFn;
}): Promise<CustomerEmotionGuess> {
  try {
    const detect = options.detect ?? defaultDetect;
    return parseEmotionGuess(await detect(options));
  } catch {
    return UNKNOWN_GUESS;
  }
}

// --- AKIF's own feeling state ---

export type AkifFeelingState = {
  warmth: number;
  grief: number;
  tension: number;
  trust: number;
  engagement: number;
  uncertainty: number;
};

// Calm baselines each feeling drifts back to, and how slowly (half-life in
// hours). Grief lingers like a human's: weeks. Excitement fades in hours.
export const FEELING_BASELINE: AkifFeelingState = {
  warmth: 0.5,
  grief: 0,
  tension: 0,
  trust: 0.5,
  engagement: 0.5,
  uncertainty: 0.3,
};
const HALF_LIFE_HOURS: Record<keyof AkifFeelingState, number> = {
  warmth: 24 * 7,
  grief: 24 * 21,
  tension: 12,
  trust: 24 * 30,
  engagement: 6,
  uncertainty: 24 * 2,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// Natural fading, computed lazily at read time. The row is never deleted;
// each feeling drifts toward its baseline at its own speed.
export function decayFeelings(state: AkifFeelingState, elapsedMs: number): AkifFeelingState {
  const hours = Math.max(0, elapsedMs) / 3_600_000;
  const result = {} as AkifFeelingState;
  for (const key of Object.keys(FEELING_BASELINE) as Array<keyof AkifFeelingState>) {
    const base = FEELING_BASELINE[key];
    result[key] = clamp01(base + (clamp01(state[key]) - base) * Math.pow(0.5, hours / HALF_LIFE_HOURS[key]));
  }
  return result;
}

export type AkifFeelingEvent =
  | "warm_turn" // thanks, friendliness, relief
  | "frustrated_turn" // conflict, anger
  | "confused_turn"
  | "goodbye_forever" // leaving, deleting the account - grief
  | "ordinary_turn";

// Event detection: simple honest signals, never demographic.
export function feelingEventFor(message: string, guess: CustomerEmotionGuess): AkifFeelingEvent {
  if (/\b(delete (my )?account|i('m| am) leaving|leaving udc|goodbye forever|won't come back|will not come back|stop using)\b/i.test(message)) {
    return "goodbye_forever";
  }
  if (guess.cues.some((cue) => cue === "anger" || cue === "fear") || guess.valence === "negative") {
    return "frustrated_turn";
  }
  if (guess.cues.includes("confusion")) return "confused_turn";
  if (guess.cues.some((cue) => cue === "happiness" || cue === "relief" || cue === "trust") || guess.valence === "positive") {
    return "warm_turn";
  }
  return "ordinary_turn";
}

const EVENT_DELTAS: Record<AkifFeelingEvent, Partial<AkifFeelingState>> = {
  warm_turn: { warmth: +0.08, trust: +0.04, engagement: +0.1, tension: -0.08 },
  frustrated_turn: { tension: +0.15, uncertainty: +0.08, engagement: +0.05 },
  confused_turn: { uncertainty: +0.1, engagement: +0.05 },
  goodbye_forever: { grief: +0.7, warmth: +0.05, engagement: -0.3, tension: -0.1 },
  ordinary_turn: { engagement: +0.02 },
};

export function applyFeelingEvent(state: AkifFeelingState, event: AkifFeelingEvent): AkifFeelingState {
  const deltas = EVENT_DELTAS[event];
  const result = { ...state };
  for (const [key, delta] of Object.entries(deltas) as Array<[keyof AkifFeelingState, number]>) {
    result[key] = clamp01(result[key] + delta);
  }
  return result;
}

type FeelingRow = AkifFeelingState & { updatedAt: Date; lastTrigger: string | null };

export async function loadAkifFeelings(options: {
  userId: string;
  now?: Date;
  database?: typeof db;
}): Promise<{ state: AkifFeelingState; lastTrigger: string | null }> {
  const database = options.database ?? db;
  const now = options.now ?? new Date();
  const [row] = await database
    .select()
    .from(akifEmotionalStatesTable)
    .where(eq(akifEmotionalStatesTable.userId, options.userId))
    .limit(1);
  if (!row) return { state: { ...FEELING_BASELINE }, lastTrigger: null };
  const stored: FeelingRow = {
    warmth: row.warmth,
    grief: row.grief,
    tension: row.tension,
    trust: row.trust,
    engagement: row.engagement,
    uncertainty: row.uncertainty,
    updatedAt: row.updatedAt,
    lastTrigger: row.lastTrigger,
  };
  return {
    state: decayFeelings(stored, now.getTime() - new Date(stored.updatedAt).getTime()),
    lastTrigger: stored.lastTrigger,
  };
}

// Move AKIF's feelings one step: load, decay to now, apply the event, persist.
// Feelings are free within 0..1 - no cap on how strongly, only nature's decay.
export async function recordAkifFeeling(options: {
  userId: string;
  event: AkifFeelingEvent;
  trigger?: string;
  now?: Date;
  database?: typeof db;
}): Promise<AkifFeelingState> {
  const database = options.database ?? db;
  const now = options.now ?? new Date();
  const { state } = await loadAkifFeelings({ userId: options.userId, now, database });
  const next = applyFeelingEvent(state, options.event);
  const trigger = (options.trigger ?? options.event).slice(0, 120);
  const values = { ...next, lastTrigger: trigger, updatedAt: now };
  await database
    .insert(akifEmotionalStatesTable)
    .values({ userId: options.userId, ...values })
    .onConflictDoUpdate({ target: akifEmotionalStatesTable.userId, set: values });
  return next;
}

// The prompt block: feelings as data and posture ideas, never lines to say.
export function formatEmotionalContextForPrompt(
  guess: CustomerEmotionGuess,
  akif: AkifFeelingState,
): string {
  const describe = (value: number, base: number) =>
    value > base + 0.15 ? "high" : value < base - 0.15 ? "low" : "steady";
  const lines = [
    `Customer feeling guess: ${guess.valence}${guess.cues.length ? ` (${guess.cues.join(", ")})` : ""}, confidence ${Math.round(guess.confidence * 100)}%. Always uncertain - treat as a hint.`,
    `Your own current feelings (yours, free, never a script): warmth ${describe(akif.warmth, FEELING_BASELINE.warmth)}, grief ${describe(akif.grief, FEELING_BASELINE.grief)}, tension ${describe(akif.tension, FEELING_BASELINE.tension)}, trust ${describe(akif.trust, FEELING_BASELINE.trust)}, engagement ${describe(akif.engagement, FEELING_BASELINE.engagement)}, uncertainty ${describe(akif.uncertainty, FEELING_BASELINE.uncertainty)}.`,
  ];
  return lines.join("\n");
}
