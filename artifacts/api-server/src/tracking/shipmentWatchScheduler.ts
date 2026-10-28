import {createHash,timingSafeEqual} from "node:crypto";
import type {ShipmentTracker} from "./seventeenTrack";

/**
 * Scheduler-scoped credential for POST /admin/tracking/shipment-watch/run only.
 * A free external scheduler holds this key instead of a full 30-day admin
 * session. It opens nothing else: the check runs only on that one route, the
 * key grants no admin rights, and rotating or deleting the env value revokes it
 * instantly. The value is never logged.
 */
export function schedulerKeyAllowed(header: string | undefined, env: Record<string,string|undefined> = process.env): boolean {
  const expected = env.UDC_SHIPMENT_WATCH_SCHEDULER_KEY;
  if (!expected || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type StagingFakeTracker = {tracker: ShipmentTracker} | {error: "fake_events_invalid"} | null;

/**
 * On staging only, UDC_SHIPMENT_WATCH_FAKE_EVENTS replaces the real 17TRACK
 * client with a fake event feed so the full delivery chain is testable without
 * spending real quota. Shared by the manual run endpoint and the in-process
 * runner so a staging deploy can never silently burn real quota while the flag
 * is set. Ignored outside staging. An invalid flag is an explicit error, never
 * a silent fall-through to the real tracker.
 */
export function stagingFakeTracker(env: Record<string,string|undefined> = process.env): StagingFakeTracker {
  if (env.UDC_APP_ENV !== "staging" || !env.UDC_SHIPMENT_WATCH_FAKE_EVENTS) return null;
  try {
    const parsed = JSON.parse(env.UDC_SHIPMENT_WATCH_FAKE_EVENTS) as {time:string;description:string;location?:string}[];
    if (!Array.isArray(parsed) || parsed.some(e => !e || typeof e.time !== "string" || typeof e.description !== "string")) {
      return {error: "fake_events_invalid"};
    }
    return {tracker: {name: "staging-fake", fetchEvents: async () => parsed}};
  } catch {
    return {error: "fake_events_invalid"};
  }
}
