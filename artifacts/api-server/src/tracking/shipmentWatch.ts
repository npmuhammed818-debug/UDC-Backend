import {classifyCarrierDescription} from './classifyCarrierEvent';
// Automatic shipment updates (feature requested by the owner through the
// Instinct relay on 28 Oct): the customer gives a tracking number once; the
// watcher checks it sparingly via 17TRACK and messages the customer on a real
// change: shipped, delayed or delivered. Quota guard: one provider call per
// watch per 12 hours, and none at all without a configured key (the tracker
// is then the inert stub). No status is ever invented.
import {and,asc,eq,gt,isNull,or,lt} from "drizzle-orm";
import {auditLogsTable,db,notificationsTable,shipmentWatchesTable} from "@workspace/db";
import {activeTracker,type ShipmentTracker,type ShipmentTrackEvent} from "./seventeenTrack";
import {enqueueShipmentWhatsApp} from "../notifications/shipmentOutbox";

export const WATCH_POLL_INTERVAL_MS = 12 * 60 * 60 * 1000; // two checks a day at most
export const WATCH_MAX_PER_USER = 5;
const PAGE_SIZE = 100;

export type WatchClass = "shipped" | "delayed" | "delivered";

export function classifyLatestEvent(events: ShipmentTrackEvent[]): { cls: WatchClass; event: ShipmentTrackEvent } | null {
  const latest = events[0];
  if (!latest) return null;
  const cls=classifyCarrierDescription(latest.description);return cls?{cls,event:latest}:null;
}

export function eventFingerprint(cls: WatchClass, event: ShipmentTrackEvent): string {
  return `${cls}|${event.time}|${event.description.slice(0, 120)}`;
}

export function watchUpdateText(trackingNumber: string, cls: WatchClass, event: ShipmentTrackEvent): { title: string; body: string } {
  const time = new Date(event.time);
  const when = Number.isFinite(time.valueOf()) ? time.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "";
  const label = cls === "shipped" ? "Shipped" : cls === "delayed" ? "Delayed" : "Delivered";
  const where = event.location ? ` in ${event.location.slice(0, 120)}` : "";
  return {
    title: `Shipment ${label.toLowerCase()}: ${trackingNumber.slice(0, 40)}`,
    body: [
      `Shipment update for ${trackingNumber}: ${label}.`,
      `${event.description.slice(0, 300)}${where}${when ? ` · ${when}` : ""}`,
      "Reported by the carrier via 17TRACK. UDC has not verified this update.",
    ].join("\n"),
  };
}

export async function runShipmentWatchPoll(options: {
  database?: typeof db;
  tracker?: ShipmentTracker;
  now?: Date;
  intervalMs?: number;
} = {}) {
  const database = options.database ?? db;
  const tracker = options.tracker ?? activeTracker();
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw Error("invalid_utc_time");
  const intervalMs = options.intervalMs ?? WATCH_POLL_INTERVAL_MS;
  const dueBefore = new Date(now.getTime() - intervalMs);
  let cursor: string | undefined;
  let polled = 0, notified = 0, unchanged = 0, failed = 0;
  for (;;) {
    const page = await database.select().from(shipmentWatchesTable)
      .where(and(
        eq(shipmentWatchesTable.active, true),
        or(isNull(shipmentWatchesTable.lastPolledAt), lt(shipmentWatchesTable.lastPolledAt, dueBefore)),
        ...(cursor ? [gt(shipmentWatchesTable.id, cursor)] : []),
      ))
      .orderBy(asc(shipmentWatchesTable.id)).limit(PAGE_SIZE);
    for (const watch of page) {
      // Lock and recheck the current due row before any provider request. A
      // second worker skips this row rather than spending quota or duplicating
      // a notification. The transaction owns the claim through queue creation.
      await database.transaction(async (tx) => {
        const [current] = await tx.select().from(shipmentWatchesTable).where(and(
          eq(shipmentWatchesTable.id, watch.id), eq(shipmentWatchesTable.active, true),
          or(isNull(shipmentWatchesTable.lastPolledAt), lt(shipmentWatchesTable.lastPolledAt, dueBefore)),
        )).limit(1).for('update', { skipLocked: true });
        if (!current) return;
        polled++;
        let events: ShipmentTrackEvent[];
        try { events = await tracker.fetchEvents(current.trackingNumber); }
        catch {
          failed++;
          // A failed request still spends provider quota. Respect the cadence.
          await tx.update(shipmentWatchesTable).set({ lastPolledAt: now, updatedAt: now }).where(eq(shipmentWatchesTable.id, current.id));
          return;
        }
        const found = classifyLatestEvent(events);
        const fingerprint = found ? eventFingerprint(found.cls, found.event) : null;
        if (!found || fingerprint === current.lastFingerprint) {
          unchanged++;
          await tx.update(shipmentWatchesTable).set({ lastPolledAt: now, updatedAt: now }).where(eq(shipmentWatchesTable.id, current.id));
          return;
        }
        const { title, body } = watchUpdateText(current.trackingNumber, found.cls, found.event);
        await tx.update(shipmentWatchesTable)
          .set({ lastFingerprint: fingerprint, lastClass: found.cls, lastPolledAt: now, updatedAt: now })
          .where(eq(shipmentWatchesTable.id, current.id));
        const [notice] = await tx.insert(notificationsTable).values({
          userId: current.userId, type: "shipment_watch_update", title, body,
          link: current.dealId ? `/deals/${current.dealId}/tracking` : null,
        }).returning({ id: notificationsTable.id });
        if (notice) await enqueueShipmentWhatsApp(tx, { notificationId: notice.id, dealId: current.dealId, recipientUserId: current.userId });
        await tx.insert(auditLogsTable).values({
          actorUserId: null, action: "shipment_watch_update_created", entityType: "shipment_watch", entityId: current.id,
          metadata: { cls: found.cls, trackingNumber: current.trackingNumber, dealLinked: Boolean(current.dealId) },
        });
        notified++;
      });
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
  return { polled, notified, unchanged, failed };
}
