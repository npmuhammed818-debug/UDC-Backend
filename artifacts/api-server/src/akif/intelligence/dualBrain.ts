// The owner's two-brains-at-once design (31 Oct): the fast brain and the deep
// brain both see the customer message at the same moment. Easy chats go out as
// the fast draft; hard chats (grief, anger, money, legal) are answered by the
// deep brain. A fast draft that fails the code validator gets one Reflexion
// round: the deep brain writes a short lesson, the fast brain retries once with
// it, and the deep brain answers if the retry is still bad. Lessons are returned
// to the caller so they can enter the shared-lesson pipeline (privacy-checked).
// Env-gated: AKIF_DUAL_BRAIN=on. Default off keeps today's single-call behavior.
import { runCheapModelChat } from './cheapModel.ts';
import { runStrongModelChat } from './strongModel.ts';

type ChatResult = { content: string };
type ChatFn = (message: string, system: string | undefined, timeoutMs: number) => Promise<ChatResult>;
export type DualBrainSlots = { fast?: ChatFn; deep?: ChatFn };

export type DualBrainOutcome = {
  content: string;
  brain: 'fast' | 'deep' | 'fast-retry';
  deepChecked: boolean;
  lesson: string | null;
};

export function isDualBrainEnabled(): boolean {
  return ['on', '1', 'true'].includes((process.env.AKIF_DUAL_BRAIN ?? '').trim().toLowerCase());
}

const CHECK_SYSTEM = 'You are the quality checker for AKIF, a WhatsApp trade coordinator. '
  + 'Read the customer message and the draft reply. If the draft is warm, honest, concise and safe, '
  + 'reply {"ok":true}. If not, reply {"ok":false,"lesson":"one short line telling the writer exactly '
  + 'what to fix - never include prices, percentages, names or private details"}. Reply with JSON only.';

function parseLesson(raw: string): string | null {
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; lesson?: string };
    if (parsed && typeof parsed.lesson === 'string' && parsed.lesson.trim()) return parsed.lesson.trim().slice(0, 300);
    return null;
  } catch {
    // Tolerate a checker that answers in prose: a short reply is itself the lesson.
    return text.length > 0 && text.length <= 300 ? text : null;
  }
}

export async function runDualBrainReply(
  message: string,
  system: string | undefined,
  options: { hardTurn: boolean; timeoutMs: number; validate?: (reply: string) => boolean },
  slots: DualBrainSlots = {},
): Promise<DualBrainOutcome> {
  const fast = slots.fast ?? runCheapModelChat;
  const deep = slots.deep ?? runStrongModelChat;
  const validate = options.validate ?? ((reply: string) => Boolean(reply.trim()));

  // Hard turns: both brains run from the same moment; the deep brain's answer
  // is the one the customer gets. The fast draft still runs so its latency and
  // content can be compared in staging telemetry.
  if (options.hardTurn) {
    const [fastResult, deepResult] = await Promise.allSettled([
      fast(message, system, options.timeoutMs),
      deep(message, system, options.timeoutMs),
    ]);
    if (deepResult.status === 'fulfilled') {
      return { content: deepResult.value.content, brain: 'deep', deepChecked: true, lesson: null };
    }
    if (fastResult.status === 'fulfilled') {
      return { content: fastResult.value.content, brain: 'fast', deepChecked: false, lesson: null };
    }
    throw deepResult.reason;
  }

  // Easy turns: the fast draft goes out when it passes the code validator.
  const draft = (await fast(message, system, options.timeoutMs)).content.trim();
  if (validate(draft)) {
    return { content: draft, brain: 'fast', deepChecked: false, lesson: null };
  }

  // Reflexion: the deep brain writes one short lesson about the bad draft, the
  // fast brain retries once with it. The code validator still decides; the
  // checker can only teach, never overrule.
  let lesson: string | null = null;
  try {
    const check = await deep(
      JSON.stringify({ customerMessage: message.slice(0, 1000), draft: draft.slice(0, 1000) }),
      CHECK_SYSTEM,
      options.timeoutMs,
    );
    lesson = parseLesson(check.content);
  } catch {
    lesson = null;
  }
  const retrySystem = (system ?? '') + (lesson ? ` Your previous draft was rejected. Lesson: ${lesson}` : ' Your previous draft was rejected: be warm, honest and concise.');
  const retry = (await fast(message, retrySystem, options.timeoutMs)).content.trim();
  if (validate(retry)) {
    return { content: retry, brain: 'fast-retry', deepChecked: true, lesson };
  }

  const answer = await deep(message, system, options.timeoutMs);
  return { content: answer.content, brain: 'deep', deepChecked: true, lesson };
}
