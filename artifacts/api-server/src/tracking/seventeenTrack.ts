// 17TRACK automatic shipment tracking (owner picked 17TRACK free tier, 28 Oct).
// This build ships the client against a MOCK/STUB ONLY: no signup, no real API
// key, no spend. A real key arrives later via a vault link, only after his
// separate yes, and only then does isSeventeenTrackConfigured() turn live.
export interface ShipmentTrackEvent {
  time: string;          // ISO time from the carrier feed
  description: string;   // carrier status line
  location?: string;
}

export interface ShipmentTracker {
  readonly name: string;
  fetchEvents(trackingNumber: string): Promise<ShipmentTrackEvent[]>;
}

export function isSeventeenTrackConfigured(): boolean {
  return Boolean(process.env.SEVENTEEN_TRACK_API_KEY?.trim());
}

// Live client. Inert unless SEVENTEEN_TRACK_API_KEY is set; tests mock fetch.
export function createSeventeenTrackClient(): ShipmentTracker {
  return {
    name: '17track',
    async fetchEvents(trackingNumber: string): Promise<ShipmentTrackEvent[]> {
      const apiKey = process.env.SEVENTEEN_TRACK_API_KEY?.trim();
      if (!apiKey) throw new Error('17TRACK is not configured');
      const baseUrl = (process.env.SEVENTEEN_TRACK_BASE_URL?.trim() || 'https://api.17track.net').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/track/v2.2/gettrackinfo`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json', '17token': apiKey },
        body: JSON.stringify([{ number: trackingNumber }]),
      });
      if (!response.ok) throw new Error(`17TRACK returned HTTP ${response.status}`);
      const raw = await response.json() as { data?: { accepted?: Array<{ track_info?: { latest_event?: { time_iso?: string; description?: string; location?: string } } }> } };
      const latest = raw.data?.accepted?.[0]?.track_info?.latest_event;
      return latest?.time_iso && latest?.description
        ? [{ time: latest.time_iso, description: latest.description, ...(latest.location ? { location: latest.location } : {}) }]
        : [];
    },
  };
}

// Synthetic in-memory stub: the default until the owner approves a real key.
export function createStubTracker(events: Record<string, ShipmentTrackEvent[]> = {}): ShipmentTracker {
  return {
    name: 'stub',
    async fetchEvents(trackingNumber: string): Promise<ShipmentTrackEvent[]> {
      return events[trackingNumber] ?? [];
    },
  };
}

// Until a real key exists, tracking answers come from records UDC humans saved.
export function activeTracker(): ShipmentTracker {
  return isSeventeenTrackConfigured() ? createSeventeenTrackClient() : createStubTracker();
}
