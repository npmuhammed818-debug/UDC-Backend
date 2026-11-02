# 17TRACK key-day checklist

Status: staging RC code only. No real API key, no live provider call, no env change and no migration has been applied by this work.

## What is left before key day

1. Finish the active security hardening and red-team loop on the RC branch.
2. Decide the natural tracking wording below before changing AKIF behaviour.
3. Deploy the RC branch to staging and apply the reviewed migrations in order, including the shipment watch and deal-less outbox migrations. Production stays blocked until the owner says yes.
4. Complete the remaining MVP hardening work; the polished admin pages remain the last build item.
5. Prepare a 17TRACK API account/key for vault delivery. Current 17TRACK docs say new API accounts get a one-time 200-number free quota; the old automatic 100/month allocation stopped on 2026-01-07. New registrations use quota; continued checks of an already registered number do not.

## Natural tracking behaviour plan - awaiting owner yes

No code change yet.

- Match only clear tracking asks with a number: "where is my cargo <number>", "where is my container <number>", "status of BL <number>", "track my shipment <number>", and the same for order/package/parcel/AWB.
- A number must be 5-50 letters, numbers or hyphens, start and end with a letter or number, and contain a digit. Invalid input gets: "That does not look like a tracking number. Send Track followed by the number, for example: track 1Z999AA10123456784."
- "where is my cargo" without a number keeps the existing behaviour: show UDC-recorded deal tracking. No 17TRACK call.
- "watch", "follow" or "monitor" plus a number remains the only path that creates automatic updates. "where is..." never creates a watch.
- Verified users only. Pending, suspended or unknown users get the existing verification/pending reply and no provider call.
- With no configured key, the reply stays: "Live carrier tracking is not switched on yet. Open My deals, choose your deal and tap Track shipment for the latest UDC-recorded update."
- With a key, the answer stays the existing honest format: latest carrier event, location/time when present, and "Reported by the carrier via 17TRACK. UDC has not verified this update."
- If several numbers appear in one message, do not guess: "Which number should I track? Send Track followed by one number."
- Ordinary trade questions that merely mention cargo, BL or a container stay with AKIF's normal deal brain and never call 17TRACK.

## Key-day runbook

1. Receive the 17TRACK key only through a vault link. Never accept it in chat. Prefer separate staging and production 17TRACK accounts/keys, as 17TRACK recommends separate environments.
2. Deploy agent sets staging env only: `SEVENTEEN_TRACK_API_KEY`; keep `SEVENTEEN_TRACK_BASE_URL` unset unless support directs otherwise. Confirm no value appears in logs, screenshots or reports.
3. Re-run the full gates: `pnpm run typecheck:libs`, api-server `typecheck`, api-server `test`, then the disposable-Postgres integration suites. No production env or DB change.
4. Security recheck after the key: no key in logs or errors, no provider error leakage to customers, 6-hour one-off cache intact, each watch polls at most once per 12 hours, provider calls stay inside the 3 requests/second API limit, and no endpoint exposes quota/key details.
5. Quota check before first real registration: confirm the account's remaining quota in the 17TRACK dashboard. First registration of a new number consumes one quota; ask the owner before enabling any flow that can consume it.
6. Fake-provider staging smoke first: register -> get latest event -> watch -> shipped/delayed/delivered notification queued, with WhatsApp send gate off.
7. Real-provider staging smoke only after the owner's quota yes: one safe tracking number, register -> get latest event. No customer data and no live WhatsApp send.
8. T&C and customer wording check: UDC must say carrier-reported data via 17TRACK, not verified by UDC, not real-time GPS/AIS, subject to carrier delay/error, cached up to 6 hours, watches check at most twice daily, and WhatsApp updates need consent/preferences and an approved template outside a chat window.
9. AKIF short training pass with synthetic examples only: exact track/watch commands, honest no-key answer, no invented statuses, no commission/policy changes, customer language preserved. Owner reviews the lesson before use.
10. Launch gate: production remains blocked until the owner explicitly says yes after staging evidence. At launch review: backups, migration list, rollback plan, staging smoke evidence, quota remaining, Meta send readiness, admin runbook and abort owner.

Sources checked 2026-11-02:
- 17TRACK API v2.2 docs: https://asset.17track.net/api/document/v2.2_en/index.html
- 17TRACK plan details: https://help.17track.net/hc/en-us/articles/37575217580825-Plan-Details
