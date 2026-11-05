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
// 17TRACK v2.2 requires a number to be registered before it is tracked.
// Registration consumes quota only for a new number; the provider's "already
// registered" response is success for us and never blocks the lookup.
export function createSeventeenTrackClient(): ShipmentTracker {
  async function post<T>(path: 'register' | 'gettrackinfo', trackingNumber: string): Promise<{ code: number; data: T }> {
    const apiKey = process.env.SEVENTEEN_TRACK_API_KEY?.trim();
    if (!apiKey) throw new Error('17TRACK is not configured');
    const baseUrl = (process.env.SEVENTEEN_TRACK_BASE_URL?.trim() || 'https://api.17track.net').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/track/v2.2/${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', '17token': apiKey },
      body: JSON.stringify([{ number: trackingNumber }]),
    });
    if (!response.ok) throw new Error(`17TRACK returned HTTP ${response.status}`);
    const raw = await response.json() as { code?: number; data?: T };
    const alreadyRegistered = path === 'register' && raw.code === -18019901;
    if (raw.code !== 0 && !alreadyRegistered) throw new Error('17TRACK request was rejected');
    return { code: raw.code ?? -1, data: raw.data ?? {} as T };
  }

  async function register(trackingNumber: string): Promise<void> {
    type RegisterData = {
      accepted?: Array<{ number?: string }>;
      rejected?: Array<{ number?: string; error?: { code?: number } }>;
    };
    const response = await post<RegisterData>('register', trackingNumber);
    if (response.code === -18019901) return;
    const data = response.data;
    const wanted = trackingNumber.toLowerCase();
    const accepted = data.accepted?.some((item) => item.number?.toLowerCase() === wanted) ?? false;
    const alreadyRegistered = data.rejected?.some((item) =>
      item.number?.toLowerCase() === wanted && item.error?.code === -18019901
    ) ?? false;
    if (!accepted && !alreadyRegistered) throw new Error('17TRACK registration failed');
  }

  return {
    name: '17track',
    async fetchEvents(trackingNumber: string): Promise<ShipmentTrackEvent[]> {
      await register(trackingNumber);
      const { data } = await post<{
        accepted?: Array<{ number?: string; track_info?: { latest_event?: { time_iso?: string; description?: string; location?: string } } }>;
      }>('gettrackinfo', trackingNumber);
      const accepted=data.accepted?.filter(item=>item.number?.toLowerCase()===trackingNumber.toLowerCase());
      if(!accepted?.length)return [];
      if(accepted.length!==1)throw Error('17TRACK ambiguous tracking record');
      const latest = accepted[0]?.track_info?.latest_event;
      return typeof latest?.time_iso==='string'&&Number.isFinite(Date.parse(latest.time_iso))&&typeof latest.description==='string'&&latest.description.trim()
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
