// Brain time-awareness + long-term memory write helpers (owner feature yes,
// 8 Nov). Both are env-gated OFF by default: AKIF_BRAIN_TIME_AWARE and
// AKIF_BRAIN_MEMORY_WRITE. Pure module - no db imports - so it stays cheap to
// test and to reason about.

export function isBrainTimeAwareEnabled(): boolean {
  return ["on", "1", "true"].includes((process.env.AKIF_BRAIN_TIME_AWARE ?? "").trim().toLowerCase());
}

export function isBrainMemoryWriteEnabled(): boolean {
  return ["on", "1", "true"].includes((process.env.AKIF_BRAIN_MEMORY_WRITE ?? "").trim().toLowerCase());
}

// Single-timezone countries only. A customer in a multi-zone country (US,
// Canada, Australia, ...) gets no time line - a wrong guess is worse than
// none, and the customer can always tell AKIF the hour.
const COUNTRY_TIMEZONES: Record<string, string> = {
  india: "Asia/Kolkata",
  "united arab emirates": "Asia/Dubai",
  uae: "Asia/Dubai",
  qatar: "Asia/Qatar",
  oman: "Asia/Muscat",
  "saudi arabia": "Asia/Riyadh",
  singapore: "Asia/Singapore",
  malaysia: "Asia/Kuala_Lumpur",
  thailand: "Asia/Bangkok",
  vietnam: "Asia/Ho_Chi_Minh",
  indonesia: "Asia/Jakarta",
  bangladesh: "Asia/Dhaka",
  pakistan: "Asia/Karachi",
  "sri lanka": "Asia/Colombo",
  china: "Asia/Shanghai",
  japan: "Asia/Tokyo",
  "south korea": "Asia/Seoul",
  turkey: "Europe/Istanbul",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  germany: "Europe/Berlin",
  france: "Europe/Paris",
  netherlands: "Europe/Amsterdam",
  kenya: "Africa/Nairobi",
  nigeria: "Africa/Lagos",
};

// One prompt line with the customer's local time, or null when the feature is
// off, the country is unknown or multi-zone. The brain uses it for manner
// only (a late hour means gentle and brief) - never for facts or deals.
export function customerLocalTimeLine(country?: string | null, now: Date = new Date()): string | null {
  if (!isBrainTimeAwareEnabled() || !country) return null;
  const zone = COUNTRY_TIMEZONES[country.trim().toLowerCase()];
  if (!zone) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, weekday: "long", year: "numeric", month: "long",
      day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
    return `Customer local time right now: ${fmt.format(now)} (${zone}). Let it color your manner naturally - a late hour means gentle and brief; never recite the time unless it genuinely helps.`;
  } catch {
    return null;
  }
}

// What the brain may privately note about a customer: facts the customer
// stated (preferences, names, context they asked to keep). Never ID numbers,
// documents, passwords or payment details - those must not be written down.
const ID_NUMBER = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
const ID_WORDS = /aadhaar|aadhar|passport|pan card|national id|ssn|social security|password|cvv|card number|otp|one[- ]time/i;

export function factStorageBlock(fact: string): string | null {
  const text = fact.trim();
  if (!text) return "Nothing to note.";
  if (text.length > 300) return "Not stored - a note is one short fact, not a paragraph.";
  if (ID_NUMBER.test(text) || ID_WORDS.test(text)) {
    return "Not stored - never note ID numbers, documents, passwords or payment details. Carry on without storing it.";
  }
  return null;
}
