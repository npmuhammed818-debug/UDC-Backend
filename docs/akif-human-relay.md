# AKIF Human Relay (staging tests)

Staging-only test mode, owner direction 9 Nov 2026: open chat turns from an
allowlisted test number are held in memory for a dev-side human answer instead
of AKIF answering straight away. Built for relay testing with the owner's own
number before any pilot; not a launch feature.

## What it does

- `AKIF_HUMAN_RELAY_ENABLED=true` + `AKIF_HUMAN_RELAY_NUMBERS` (digits-only,
  comma-separated) switch it on for those numbers only. Default OFF; every
  other sender and every code path is unchanged.
- Text and voice-note open chat turns from an allowlisted number are held in
  memory (6h TTL, 20 per number, 200 total). Menus, forms, consent, crisis,
  deal commands and money paths keep their scripted gates and never relay.
- Voice notes are transcribed by the same worker path as normal and held with
  their transcript and detected language. Raw audio is never kept or relayed.
- The brain still runs silently on held messages, so each held item carries
  the brain's draft reply (tools included) as a suggestion. Deferred
  background work is cancelled, never started - the dev side decides what
  actually goes out.
- In-memory only: a restart drops held messages. No database writes.

## Dev-side endpoints

All under `/api/akif-relay/`, all 404 unless the relay is on and the request
carries `x-udc-relay-signature` - HMAC-SHA256 with the staging
`WHATSAPP_APP_SECRET` over `read-relay` for GETs, over the exact raw JSON body
for POSTs (same trust bar as the reply-sink readout).

- `GET /status` - relay flags: pending count, number count, brain drafts on,
  voice in/out on, reply-sink on, how many relay numbers can get real sends.
- `GET /pending` - held items: id, phone, at, kind (text|voice), text,
  heardLanguage, brain draft, whether background work was discarded.
- `POST /reply` `{phone, text, voice?}` - sends the dev-side answer through the
  normal guarded delivery path (`voice:true` tries a voice note and falls back
  to text honestly). Outbound is locked to the same allowlist as inbound.
  Text is capped at 1500 chars; 10 replies/minute per process. On success all
  held items for that number are marked answered. A failed send returns 502
  and leaves items pending.
- `POST /skip` `{phone}` - marks held items answered without sending.

Real WhatsApp delivery still obeys the staging reply sink: with
`AKIF_WHATSAPP_REPLY_SINK=store`, only numbers in
`AKIF_WHATSAPP_REPLY_ALLOWLIST` get real Meta sends.

## Limits

- Held messages wait for the dev side to answer; nothing is automatic.
- Brain drafts cost the same Groq calls as a normal turn (rate/cost guards
  apply) and can be absent on failure - the message is still held.
- A brain draft's session is saved as usual, so a later non-relay turn sees it.
- `voice:true` replies go through the normal voice gates (master switch, per-
  user voice preference, privacy rules, daily limit) and fall back to text
  with an honest note when voice cannot go out.
