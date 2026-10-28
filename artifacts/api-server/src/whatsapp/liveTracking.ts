// Live carrier tracking in chat: a verified user sends "track <number>" and
// gets the latest carrier-reported status in plain words. Inert until a real
// 17TRACK key is configured (SEVENTEEN_TRACK_API_KEY); without it the reply
// says honestly that live tracking is off and points to UDC-recorded updates.
// No status is ever invented: every line comes from the carrier feed.
import { activeTracker, isSeventeenTrackConfigured, type ShipmentTracker } from '../tracking/seventeenTrack.ts';

// One carrier check per number per 6 hours: the 17TRACK free tier has a small
// quota, and carrier scans are not real-time anyway.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; text: string }>();

export function clearLiveTrackingCache() {
  cache.clear();
}

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function formatLiveStatus(number: string, events: { time: string; description: string; location?: string }[]): string {
  if (!events.length) {
    return `No carrier updates found for ${number} yet. Check the number and send Track followed by the number again.`;
  }
  const latest = events[0];
  const time = new Date(latest.time);
  const when = Number.isFinite(time.valueOf()) ? time.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
  const where = clip(latest.location, 120);
  const what = clip(latest.description, 300) || 'Status update received';
  return [
    `Latest carrier update for ${number}:`,
    `${what}${where ? ` in ${where}` : ''}${when ? ` · ${when}` : ''}`,
    'Reported by the carrier via 17TRACK. UDC has not verified this update.',
  ].join('\n');
}

export async function liveTrackingReply(
  rawNumber: string,
  deps: { tracker?: ShipmentTracker; now?: number; configured?: boolean } = {},
): Promise<string> {
  const number = rawNumber.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{4,38}[A-Z0-9]$/.test(number) || !/\d/.test(number)) {
    return 'That does not look like a tracking number. Send Track followed by the number, for example: track 1Z999AA10123456784.';
  }
  const configured = deps.configured ?? isSeventeenTrackConfigured();
  if (!configured) {
    return 'Live carrier tracking is not switched on yet. Open My deals, choose your deal and tap Track shipment for the latest UDC-recorded update.';
  }
  const now = deps.now ?? Date.now();
  const cached = cache.get(number);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.text;
  const tracker = deps.tracker ?? activeTracker();
  let text: string;
  try {
    text = formatLiveStatus(number, await tracker.fetchEvents(number));
  } catch {
    // Never leak provider errors or configuration details into the chat.
    return 'The carrier tracking service is unreachable right now. Please try again in a little while.';
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(number, { at: now, text });
  return text;
}
