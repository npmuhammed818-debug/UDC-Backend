import {currentCarrierEvents} from '../tracking/currentCarrierEvents.ts';
import {classifyCarrierDescription} from '../tracking/classifyCarrierEvent.ts';
// Brain-led shipment tracking answers (owner approved 2 Nov, staging,
// synthetic data, read-only answers, brain words not a fixed script, no date
// promises, nothing live). Code fetches the carrier facts; AKIF only reads
// the events it is given and writes the words, in the customer's language.
// The brain never contacts the carrier, never writes anything and never acts.
// Guards below keep the honesty rule: no delivery-date promises, no status
// the carrier feed does not support, no placeholders, no app/portal talk.
// Any failure falls back to the fixed plain-words template, never to silence.
import { udcHandbook } from './udcHandbook.ts';
import { hasUnresolvedPlaceholder } from './outboundGuard.ts';
import { runConversationChat, isAkifBrainConfigured } from './intelligence/hermesClient.ts';
import type { ShipmentTrackEvent } from '../tracking/seventeenTrack.ts';

// Same classification as the shipment watcher, kept here so this module stays
// free of database imports: which of the three watch classes the latest
// carrier event belongs to, if any.
function classifyLatest(events: ShipmentTrackEvent[]): 'shipped' | 'delayed' | 'delivered' | null {
  return classifyCarrierDescription(currentCarrierEvents(events)?.[0]?.description??'');
}

export type TrackingBrainChat = (message: string, system: string) => Promise<{ content: string }>;

const MAX_REPLY_CHARS = 600;
const MAX_EVENTS_SENT = 5;

// AKIF must never promise a delivery date. Carrier-stated text may be quoted
// as the carrier's own words, but UDC/AKIF itself never predicts or commits.
const DATE_PROMISE = new RegExp(
  '\\b(?:will|would|should|shall|going to|expect(?:ed)?|promise[sd]?|guarantee[sd]?)\\b[^.\\n]{0,60}\\b(?:arriv\\w*|deliver\\w*|reach\\w*|land\\w*|by\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\\d)|tomorrow|in\\s+\\d+\\s+(?:day|hour|week))\\b'
  + '|\\b(?:eta|estimated (?:delivery|arrival)|delivery date)\\b',
  'i');

// UDC is WhatsApp-only for customers: the brain must never point to an app,
// dashboard or portal.
const FORBIDDEN_SURFACE = /\b(?:app|application|dashboard|portal)\b/i;

function extractReply(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { reply } = parsed as { reply?: unknown };
    return typeof reply === 'string' && reply.trim() ? reply.trim() : null;
  } catch {
    return null;
  }
}

export function trackingReplyViolatesRules(reply: string, events: ShipmentTrackEvent[]): boolean {
  if (reply.length > MAX_REPLY_CHARS) return true;
  if (hasUnresolvedPlaceholder(reply)) return true;
  if (DATE_PROMISE.test(reply)) return true;
  if (/\b(?:delivery|arrival|arrives|arriving|reaches|reaching)\b[^.\n]{0,35}\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|in\s+\d+\s+(?:days?|hours?|weeks?))\b/i.test(reply)) return true;
  if (FORBIDDEN_SURFACE.test(reply)) return true;
  const cls = classifyLatest(events);
  // A status claim the carrier feed does not support is an invented fact.
  if (/\bdelivered\b|\bdelivery\s+(?:is\s+|was\s+|has\s+been\s+)?complete(?:d)?\b|\b(?:arrived|reached)\b[^.\n]{0,35}\b(?:your address|your home|recipient|consignee)\b|\breceived\s+by\s+(?:the\s+)?(?:recipient|consignee|you)\b/i.test(reply) && cls !== 'delivered') return true;
  if (/\bdelayed\b/i.test(reply) && cls !== 'delayed') return true;
  if (/\b(?:shipped|dispatched|departed|picked up|in transit)\b/i.test(reply) && cls !== 'shipped') return true;
  return false;
}

/**
 * Compose the tracking answer in AKIF's own words from carrier facts.
 * Returns null when the brain is unavailable or its words fail the guards;
 * the caller then uses the fixed plain-words template.
 */
export async function brainTrackingReply(
  input: { number: string; events: ShipmentTrackEvent[] },
  deps: { chat?: TrackingBrainChat } = {},
): Promise<string | null> {
  const ordered=currentCarrierEvents(input.events);
  if (!ordered?.length) return null;
  const chat = deps.chat ?? (isAkifBrainConfigured()
    ? (message: string, system: string) => runConversationChat(message, system)
    : null);
  if (!chat) return null;

  const system = [
    udcHandbook,
    'You are Akif answering a UDC customer who asked where their shipment is. Write the answer in your own words: warm, plain and short - one to three sentences, like a capable broker texting. Mirror the customer\'s language when the tracking question was not in English.',
    'You are given the latest carrier-reported events as data. Share what the carrier last reported - the status, place and time - in natural words. Make clear it is what the carrier reported and that UDC has not verified it, but say it lightly, not like a legal disclaimer.',
    'Never promise, predict or estimate a delivery or arrival date, even if the customer asks. If the carrier feed itself states an expected date you may mention it only as the carrier\'s own words. Never invent a status, location, delay or delivery that is not in the events. Never mention an app, dashboard, portal, provider names, APIs or internal systems. Never give tracking advice beyond checking the number or waiting for the next update.',
    'Return exactly one valid JSON object of the form {"reply": "..."} and nothing else.',
  ].join(' ');

  const events = ordered.slice(0, MAX_EVENTS_SENT).map((event) => ({
    time: event.time,
    description: event.description.slice(0, 300),
    ...(event.location ? { location: event.location.slice(0, 120) } : {}),
  }));
  const user = JSON.stringify({
    task: 'Answer the customer who asked to track this shipment.',
    trackingNumber: input.number,
    carrierReportedEvents: events,
    requiredOutput: '{"reply":"your answer to the customer"}',
  });

  let raw: string;
  try {
    raw = (await chat(user, system)).content;
  } catch {
    return null;
  }
  const reply = extractReply(raw);
  if (!reply || trackingReplyViolatesRules(reply, input.events)) return null;
  return reply;
}
