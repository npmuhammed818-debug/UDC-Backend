# Release candidate handover for staging (draft, not merged, not deployed)

Owner instruction (26 Oct 2:27 AM IST): Instinct owns code, migrations and tests. ChatGPT owns staging infrastructure, deployment and staging verification. Nothing here was merged, deployed or applied. No Render, Supabase, provider or production change was made.

## What is in this branch
Branch `dev/rc-20261026`, built on the Codex chain tip (PR #191 head `ea4e7f5`), which already contains the dev stack #158-#183, the #119-#122 fixes (identical patches) and the TLS verification from #123 (`lib/db/src/connection.ts`, `database-tls.test.ts`).

Added on top:
1. **Role switching, completed.** Admin `activate` now does, in one SERIALIZABLE transaction: checks (verified user, request pending, no deals/referrals/requests/listings, admin note, buyer/seller target needs a human-verified company), switches `users.role`, revokes every browser session, expires pending WhatsApp sign-in challenges, drops the user's WhatsApp intake draft and guided-chat state, marks the request `activated`, writes an audit row (`role_change_activated`) and a notification. History is not touched. Concurrent activations: one wins, the rest get 409 (serialization conflicts are retried).
   - Blocked cases change nothing and revoke nothing. An agent cannot become buyer/seller without a verified company. A user with any old deals, referrals, requests or listings is blocked and referred to admin (the contract's default).
2. **Meta limits (from #184).** Retry with backoff on 429 / throttle codes only. Timeouts and 5xx stay "outcome unknown" and are never retried (Codex quarantine kept). If Meta still throttles, the dedup claim is released and Meta gets a 503 so it redelivers. Per-phone inbound cap (20/min) and outbound token bucket (20/s), env-adjustable. Pool invites outside the 24h window are logged as `buyer_pool_invite_notification_not_delivered`.
3. Onboarding UX (#183) and support-email fix (#186) are in the chain.
4. Tests extended: role switching (concurrency, company verification, agent isolation, WhatsApp state reset, audit), Meta limits, fixtures updated; a flaky "505" assertion (random UUID collision) made exact.

## Migrations (ordered, all additive; run in this order; none applied by me)
`lib/db/migrations/`: 20261020211645_whatsapp_signin_challenges, 20261021113625_whatsapp_chat_sessions, 20261023_email_authentication, 20261024_shipment_cargo_units, 20261024_shipment_eta_followups, 20261024_shipment_tracking_events, 20261024_user_role_change_review, 20261024_whatsapp_customer_windows, 20261024_whatsapp_phone_recovery, 20261024_whatsapp_shipment_outbox, 20261024_whatsapp_shipment_receipts, 20261025_vault_upload_links, 20261025_whatsapp_inbound_dedup, **20261026_role_activation_status (needed for role activation)**.
Not part of this RC: the 3-decimal commission migration (owner has not approved; drafts only).
Rollback drafts in `docs/drafts/`: vault upload links, WhatsApp inbound dedup, commission 3-decimals, **role activation status (new)**. No rollback draft exists for the older table-creating migrations; their rollback is restore from backup (listed as a blocker below). ChatGPT: check which of these are already applied to UDC-Staging before running anything, and take a backup first.

## Test results (commit shown in the log header)
Raw log: `docs/release/rc-test-log-20261026.txt`. api-server typecheck OK, libs typecheck OK, unit 330/330, api-server build OK, udc-app build OK. 16 of 17 disposable-PG16 suites passed (buyer-pools, commission x2, company-verification, email-auth, email-migration-review, full-mvp-lifecycle 24 scenarios incl. role switching, p0-gates, shipment-delivery 13, shipment-migration-review, trade-journey, vault, whatsapp-buyer, whatsapp-meta-limits, whatsapp-onboarding-ux, whatsapp-webhook-retry). Real PostgreSQL with fake WhatsApp, fake mail and fake storage. Nothing here talks to Meta, Supabase or Render.
Not run: `mvp-backup-restore-rehearsal` (needs docker). Root `pnpm run build` fails on `artifacts/mockup-sandbox` (killed in this sandbox, not a product package); the two product packages build.
Not included on purpose: #153 staging HTTP smoke workflow (staging verification is ChatGPT's).

## Deployment steps for ChatGPT (staging only)
1. Backup UDC-Staging (DB + Storage). 2. Compare applied migrations, apply the ordered set above one at a time with the existing preflight scripts. 3. Deploy this exact commit to the staging service (Auto-Deploy is OFF). 4. Verify: Storage bucket-policy check, Meta redelivery behaviour on a 429, browser pass, forced re-login after a role switch.

## Known blockers (not code)
- Supabase bucket-policy check on staging (the 9/9 storage script passed on UDC-Staging earlier; the staging SQL was never applied: DB password rejected, owner decision pending).
- Render staging DB host unverified (isolation not proven).
- Meta: templates for out-of-window sends and the number's real messaging tier need the owner. Rate defaults are conservative guesses.
- Model-level prompt-injection resistance needs the real model; tests cover deterministic gates only.
- Gemini billing gate; browser visual pass; backup/restore rehearsal needs docker.
- App privacy page (`artifacts/udc-app/src/components/privacy.tsx`) still shows the old Gmail address (legal text, review needed).
