import { db, dealMeetingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// Manual-first meeting scheduling: UDC staff schedule meetings from the admin
// console; participants read the confirmed details here, inside WhatsApp.
// Times render with an explicit UTC label because deal parties sit in
// different timezones.

type DealMeeting = {
  status: string;
  scheduledAt: Date | null;
  provider: string | null;
  meetingUrl: string | null;
  agenda: string | null;
};

export function meetingDetailsQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!/\b(?:meeting|meet|call)\b/.test(t)) return false;
  // Asking to ARRANGE a meeting stays with the deal conversation
  // (meeting_request); only questions about an existing booking answer here.
  if (/\b(?:arrange|set up|setup|schedule|book|request|organize|organise|can we|could we|let's|lets)\b/.test(t)) return false;
  // "want/need" means arranging only when no existing-booking detail is asked
  // for - "I need the meeting link" is a details question, not a request.
  if (/\b(?:want|need)\b/.test(t) && !/\b(?:link|details|time|when|where)\b/.test(t)) return false;
  return /\b(?:when|what time|time|date|where|link|join|details|scheduled|confirmed|happening|today|tomorrow)\b/.test(t);
}

function formatMeeting(m: DealMeeting): string {
  const when = m.scheduledAt ? m.scheduledAt.toUTCString().replace("GMT", "UTC") : "time to be confirmed";
  const how = m.provider === "in_person"
    ? "in person"
    : `${m.provider ?? "video call"}${m.meetingUrl ? ` - join: ${m.meetingUrl}` : ""}`;
  return `${when} - ${how}${m.agenda ? ` (agenda: ${m.agenda})` : ""}`;
}

// A meeting whose start time passed more than this long ago is treated as
// done even if staff never marked it completed - "next meeting" must never
// name a time in the past.
const STALE_MEETING_GRACE_MS = 2 * 60 * 60 * 1000;

export async function scheduledDealMeetings(dealId: string): Promise<DealMeeting[]> {
  const rows = await db
    .select({
      status: dealMeetingsTable.status,
      scheduledAt: dealMeetingsTable.scheduledAt,
      provider: dealMeetingsTable.provider,
      meetingUrl: dealMeetingsTable.meetingUrl,
      agenda: dealMeetingsTable.agenda,
    })
    .from(dealMeetingsTable)
    .where(and(eq(dealMeetingsTable.dealId, dealId), eq(dealMeetingsTable.status, "scheduled")));
  return rows
    .filter((m) => !m.scheduledAt || m.scheduledAt.getTime() >= Date.now() - STALE_MEETING_GRACE_MS)
    .sort((a, b) => (a.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY) - (b.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY))
    .slice(0, 3);
}

export async function upcomingDealMeetingsReply(dealId: string): Promise<string> {
  const meetings = await scheduledDealMeetings(dealId);
  if (meetings.length === 0) {
    return "No meeting is scheduled on this deal yet. Ask me to arrange one and UDC will set it up with both sides.";
  }
  const lines = meetings.map((m, i) => `${meetings.length > 1 ? `${i + 1}. ` : ""}${formatMeeting(m)}`);
  return `Scheduled meeting${meetings.length > 1 ? "s" : ""} for this deal:\n${lines.join("\n")}`;
}

export async function nextDealMeetingLine(dealId: string): Promise<string | null> {
  const [next] = await scheduledDealMeetings(dealId);
  return next ? `Next meeting: ${formatMeeting(next)}.` : null;
}
