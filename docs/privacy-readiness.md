# UDC privacy and accessibility checklist — 4 October 2026

Scope: existing UDC backend and operator web app. This branch does not change the separate Cloudflare public company website. This is an implementation/audit record, not a legal-compliance certification.

| Screenshot item | Result and remaining work |
| --- | --- |
| 1. Privacy policy | `/privacy`: data categories, purposes, participants/providers, AI, retention, rights and contact. Owner must verify provider contracts, actual retention periods and operational response process. |
| 2. Terms | `/terms`: adult authorized business users, prohibited conduct, assistive AI, human review, fixed DLC/SGS workflow, written fee agreement. Counsel must review jurisdiction and contracting identity. |
| 3. Refund policy | `/refunds`: disclose agreement-specific charges, triggers, cancellation and refund conditions before commitment; support review channel. No invented refund guarantee or blanket waiver. |
| 4. Cookie policy | `/cookies`: session, consent-choice storage and gated sidebar preference; no reviewed analytics/ad trackers. |
| 5. Cookie banner | Necessary-only and layout-preference options have equal styling. Footer reopens controls; expiry is 180 days; declining removes the optional sidebar cookie. |
| 6. Form consent | Web registration requires unchecked terms/privacy acknowledgement and adult business confirmation; server validates both and records policy version atomically with account creation. Marketing is separate and defaults off for new registrations. Existing users are not represented as having consented. |
| 7. Data minimization | No DOB/child identity documents collected for adult confirmation; privacy submission stores request owner and state, not free-text private documents. Existing trade documents need ongoing operational retention review. |
| 8. Third-party SDKs | See inventory below. Removed external Google font requests from the production app. No analytics/ad SDK found in the reviewed entry point. No new dependency. Provider agreements and telemetry settings require owner verification. |
| 9. Dark patterns | Consent boxes unchecked, no forced optional marketing, equally presented cookie choices, optional-notification off control, explicit deletion-review behavior, Escape closes mobile navigation. |
| 10. Hidden fees | Visible footer and public fee page require written fee, tax, payer, trigger and refund disclosure. There is no payment checkout in this app to amend; actual deal fee agreements remain admin-controlled. |
| 11. Fake reviews | No public customer-review/testimonial widget found in this app. Existing per-deal feedback is authenticated transaction feedback. No fake reviews added. |
| 12. Unsupported claims | Removed registration/login claims implying verified opportunities or existing shipments. Terms explain limits of verification and AI. No safety/performance guarantee added. |
| 13. Alt text | Current app entry point has no content `<img>` tags. CSS brand link now has an accessible name; decorative SVG noise needs no alt. Future content images must have meaningful alternatives. |
| 14. Contrast | Darkened light-theme muted text; privacy pages use high-contrast text/links; visible keyboard focus. This is not a full WCAG audit of every existing dashboard state. |
| 15. Keyboard navigation | Native controls, labeled menu/notification/sign-out/close buttons, skip-to-main link, visible focus and reduced-motion support. Full assistive-technology review remains. |
| 16. Business details | `/business-details`: known trading name, operator and support email. Registered name/address/registration/tax IDs remain absent pending genuine owner details; do not fabricate. |
| 17. Children's data | New web registration is restricted to self-confirmed adult business representatives. No children's onboarding/parental-consent system added. WhatsApp text/document intake now presents a privacy notice and requires an explicit AGREE confirmation before AI/trade/document processing. An unsolicited AGREE before the current notice is not sufficient; consent is recorded by policy version using a pseudonymous phone lookup. PRIVACY, STOP/UNSUBSCRIBE and DELETE MY DATA commands work before trade consent. This is self-confirmation, not identity-based age verification. Raw signed webhook delivery metadata may still be received/retained by existing ingress; operational retention review remains necessary. |
| 18. Email unsubscribe | No transactional/marketing email-sending service found in current backend. Workspace optional-notification off control is added and in-app admin announcements now honor preferences. If an email service is added, use explicit opt-in, a working per-recipient unsubscribe link and provider List-Unsubscribe support before sending marketing. This does not modify manually sent Gmail outreach. |
| 19. Asset licensing | Production app now uses system fonts; no downloaded image asset added. React/Lucide/Radix and other dependency notices must be retained. Existing favicon/project provenance and all dependencies need owner/license review; this branch does not certify ownership. |
| 20. Deletion request | Signed-in `/privacy-settings` submits authenticated deletion-review requests with duplicate suppression and tracking. `/data-deletion` gives email/WhatsApp fallback for people without web accounts. Admin review queue records immutable state/outcome events. Admin must perform verified, scoped removal/anonymization and review retained records, providers and backups; recording resolution does not erase data. |

## Providers and SDK inventory

- Browser: React, TanStack Query, Wouter, Radix controls, Lucide icons and styling; no advertising or analytics SDK found in app entry point. Replit runtime overlay is a development plugin; cartographer/dev banner conditional on development plus REPL_ID.
- Server: Express, Pino with body/cookie/authorization redaction, Drizzle/PostgreSQL on Supabase, private Supabase storage, Meta WhatsApp Cloud API.
- AI/research: optional configured AKIF self-hosted brain, NVIDIA, OpenAI, Hermes, document-extractor/worker, Jev/Laya and ImpexQ connectors. Verify which providers are actually enabled and disclose relevant transfers/retention accurately before release.
- Google fonts removed from HTML/CSS; built-in system fonts avoid third-party font requests and redistribution licensing.

## Architecture and validation

WhatsApp consent adds a one-time eligibility/terms notice for existing and new contacts; pending first messages/documents are not processed or replayed automatically after confirmation. Users must submit their requirement again. Live Meta delivery still requires an authorized end-to-end test.

No schema migration: consent and privacy-request events reuse server-only `audit_logs`; optional communications reuse `notification_preferences`. Live read-only permission verification confirmed RLS enabled and anon/authenticated SELECT revoked on users, audit_logs and notification_preferences. No production records were created or deleted by verification.

Web registration now requires `accepted_terms: true` and `adult_business_user: true` in the API. Update any other registration client before release. Existing account login is preserved. Registration is atomic with the consent record and optional-notification preferences.

Privacy requests only use the authenticated session's user ID. Only an admin can review. PostgreSQL transaction advisory locks prevent duplicate open requests and serialize reviews. Each review creates a new audit event with an outcome visible to the requester. Do not place secrets or internal-only evidence in outcome text. Resolved requests cannot be silently reopened.

Before release: verify legal text with the actual operator/contracting identity, test authenticated registration/request/review flows in a staging environment, verify provider retention and manual deletion operations, and update the separate public website if required.

Validation results: 57 backend tests passed, including the real signed WhatsApp webhook simulation with consent before buyer/seller trade processing; production API/web build passed; HTTP smoke verified all six public policy routes and unauthenticated privacy API denials; live read-only SQL verified permissions and latest-event/owner-scoping semantics. Authenticated staging registration/deletion review and live Meta delivery still require end-to-end testing. Browser visual QA could not run because the Chromium download was unavailable.

## Additional integration testing — 4 October 2026

Passed the actual application HTTP routes and Drizzle queries against an isolated embedded PostgreSQL instance (PGlite 0.5.8 / PostgreSQL 18.3), using the current schema definitions for users, companies, sessions, audit logs, notification preferences and notifications, including generated indexes and foreign keys. Database calls were executed by PostgreSQL rather than replaced with an in-memory query mock. Authentication used actual stored sessions and password hashing.

Verified valid registration, rejection of missing consent, duplicate-email rejection, secure/HTTP-only session cookie flags, safe user profiles, atomic consent audit and default optional preferences. Verified authenticated deletion requests, duplicate suppression, requester isolation, non-admin denial, admin review/resolution, latest outcome visibility and protection against reopening resolved requests. Forced a consent-record insertion failure and confirmed the new user was rolled back. Confirmed logout revokes the stored session. Verified WhatsApp notice/AGREE, pseudonymous consent records, PRIVACY/DELETE MY DATA commands and STOP persisted in PostgreSQL.

This isolation test created no production records. It does not certify production PostgreSQL 17/Supabase configuration, migration history, multi-process contention, browser rendering or live Meta delivery. Render confirms the backend is on main commit 1302e5c and has PR previews disabled; no separate staging service was found. Render startup logs report successful Meta phone access and WABA subscription checks, which do not prove message delivery. The PR's new flow requires a deployed test endpoint and a confirmed test recipient for the remaining real WhatsApp exchange.
