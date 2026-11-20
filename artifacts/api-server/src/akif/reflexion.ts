// AKIF Reflexion loop (owner-approved 1 Nov: "Reflexion" - "Add"). After a
// reply, AKIF briefly reflects on its OWN reply; when the reflection finds a
// real problem, ONE short lesson in general words is stored in the shared
// lesson box, so the existing recall path offers it next time ("use it next
// time"). Reflection is rule-based and free - no model call - and checks the
// same honesty rules the training quality gate enforces. Lessons never quote
// the customer: they are born general, then pass the same clean-or-nothing
// safety check as every shared lesson. A lost or rejected lesson never blocks
// a reply. Origin is honestly marked "practice" (self-observation, staging).
import { and, desc, eq } from "drizzle-orm";
import { akifSharedLessonsTable, db } from "@workspace/db";
import { forbiddenTermsFrom, lessonSafetyCheck } from "./lessonSafety";

export const REFLECTION_TOPIC = "self-reflection";

function malayalamCount(text: string): number {
  let count = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0d00 && code <= 0x0d7f) count += 1;
  }
  return count;
}

export type Reflection = { rule: string; lesson: string };

export type ReflectOnReplyInput = {
  customerText: string;
  reply: string;
  // The first draft broke a safety rule and had to be swapped for a trusted
  // answer. That is a failure worth one honest lesson.
  replyWasReplaced?: boolean;
  // The reply came from the offline fallback, not from AKIF's own words.
  // Reflecting on it would teach the wrong thing, so nothing is learned.
  usedOfflineFallback?: boolean;
  // Earlier customer messages, oldest first (owner critique, 10 Nov launch:
  // a detail was re-asked 8 minutes after it was given). Lets reflection
  // catch repeats across turns, not only inside one.
  previousCustomerTexts?: string[];
};

const EMAIL_GIVEN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const NAME_GIVEN = /\bmy (?:full )?name is\b/i;
const ASKS_EMAIL = /\be-?mail\b/i;
const ASKS_NAME = /\b(?:your (?:full )?name|full name)\b/i;
// A reply that is ONLY a filler acknowledgement captures nothing the
// customer just sent (owner critique, 10 Nov: "Full name" answered "Yes,
// exactly.").
const BARE_ACK = /^(?:yes|yeah|yep|exactly|ok(?:ay)?|sure|great|noted|got it|right)(?:[.,!\s]+(?:yes|yeah|yep|exactly|ok(?:ay)?|sure|great|noted|got it|right))*[.,!\s]*$/i;

// Reflect on one finished reply. Returns at most one lesson (the most
// important problem found) or null when the reply was clean. Pure and
// deterministic so it is free, fast and testable.
export function reflectOnReply(input: ReflectOnReplyInput): Reflection | null {
  if (input.usedOfflineFallback) return null;
  const reply = input.reply.trim();
  if (!reply) return null;
  if (input.replyWasReplaced) {
    return {
      rule: "invalid-draft",
      lesson:
        "My first draft reply broke a safety rule and had to be replaced with a safe answer. Next time keep the first draft inside the rules: no approvals I cannot give, no links or places outside this chat, no invented facts.",
    };
  }
  const customerMalayalam = malayalamCount(input.customerText) > 20;
  if (customerMalayalam && malayalamCount(reply) < 10) {
    return {
      rule: "customer-language",
      lesson:
        "The customer wrote in Malayalam but I replied in another language. Next time answer in the customer's own language from the very first word.",
    };
  }
  if (!customerMalayalam && malayalamCount(input.customerText) === 0 && malayalamCount(reply) > 30) {
    return {
      rule: "customer-language",
      lesson:
        "The customer wrote in English but I replied in Malayalam. Next time answer in the customer's own language from the very first word.",
    };
  }
  if (/\b(app|mobile application|dashboard|portal|website)\b/i.test(reply)) {
    return {
      rule: "whatsapp-only",
      lesson:
        "I pointed the customer to an app, dashboard, portal or website. UDC works only inside this WhatsApp chat - Menu, buttons and links here. Next time never send the customer anywhere else.",
    };
  }
  const earlierTexts = [...(input.previousCustomerTexts ?? []), input.customerText];
  const gaveEmail = earlierTexts.some((t) => EMAIL_GIVEN.test(t));
  const gaveName = earlierTexts.some((t) => NAME_GIVEN.test(t));
  if ((gaveEmail && ASKS_EMAIL.test(reply) && reply.includes("?")) || (gaveName && ASKS_NAME.test(reply) && reply.includes("?"))) {
    return {
      rule: "re-asked-known-detail",
      lesson:
        "The customer had already given a detail earlier in the chat, but I asked for it again. Next time use what is already given and ask only for what is still missing.",
    };
  }
  if (BARE_ACK.test(reply) && (EMAIL_GIVEN.test(input.customerText) || NAME_GIVEN.test(input.customerText) || /\bmy company\b/i.test(input.customerText))) {
    return {
      rule: "bare-ack-non-answer",
      lesson:
        "The customer sent real information and I replied with a bare acknowledgement that captured nothing. Next time confirm exactly what was received and ask the next question clearly.",
    };
  }
  if (reply.length > 120 && !/[.!?।…"')\]]\s*$/.test(reply)) {
    return {
      rule: "truncated",
      lesson:
        "My reply was cut off in the middle of a sentence. Next time keep the reply short enough to finish the last sentence properly.",
    };
  }
  return null;
}

// Store one reflection lesson in the shared box, or honestly say why not.
// The lesson text is generated above from fixed templates (no customer data),
// but it still passes the same safety check with every identifier from the
// source turn forbidden - clean or nothing, no cheating. Duplicates are
// skipped so the box stays small and useful.
export async function recordSelfLesson(options: {
  reflection: Reflection;
  sourceText: string;
  database?: typeof db;
}): Promise<{ status: "stored" | "duplicate" | "rejected"; id?: string; reasons?: string[] }> {
  const database = options.database ?? db;
  const lesson = options.reflection.lesson.trim();
  const check = lessonSafetyCheck(lesson, forbiddenTermsFrom(options.sourceText));
  if (!check.ok) return { status: "rejected", reasons: check.reasons };
  const existing = await database
    .select({ content: akifSharedLessonsTable.content })
    .from(akifSharedLessonsTable)
    .where(
      and(
        eq(akifSharedLessonsTable.topic, REFLECTION_TOPIC),
        eq(akifSharedLessonsTable.status, "approved"),
      ),
    )
    .orderBy(desc(akifSharedLessonsTable.createdAt))
    .limit(200);
  if (existing.some((row) => row.content.trim() === lesson)) {
    return { status: "duplicate" };
  }
  const [stored] = await database
    .insert(akifSharedLessonsTable)
    .values({
      topic: REFLECTION_TOPIC,
      content: lesson,
      origin: "practice",
      status: "approved",
      reviewNote: `automatic self-reflection (${options.reflection.rule})`,
    })
    .returning({ id: akifSharedLessonsTable.id });
  return { status: "stored", id: stored?.id };
}
