# MVP verification gaps and controlled activation evidence

This review starts at acceptance commit `2ad7aa7a359adfd4b64d3a3527e673eda15f3170`
on a separate `codex/mvp-verification-gaps` branch. The 26 automated capabilities
and eight broader unverified capabilities retain their original scope. **None of
the eight complete external/design gates becomes PASS from simulations.** See the
[fresh capability matrix](release/full-mvp-acceptance.md) for every required proof
stage and the [staging plan](full-mvp-staging-plan.md) for migration ordering.

## Investigation of all eight gaps

| Gap | Classification and precise missing proof | Offline evidence / disposition | Remaining gate |
| --- | --- | --- | --- |
| Canonical role activation / multiple roles | Product/access design; request review deliberately retains the original canonical role. No implemented activation transaction exists to certify. | `full-mvp-lifecycle-postgres.mjs`: requests/review cannot grant privileges or rewrite identity; cross-role denials continue to hold. No implicit role activation added. | Founder must approve request/review-only staging scope, or separately approve a transition design covering re-verification, existing obligations, sessions, referrals and rollback. Approval of a request must never be represented as activated. |
| Live WhatsApp onboarding / multilingual human UAT | Real-provider and human quality dependency; synthetic signed webhook flows do not measure actual conversation quality or one continuous live journey. | `whatsapp-buyer-postgres.mjs`, `whatsapp-onboarding-ux-postgres.mjs`, guidance/voice/outage regressions exercise all three roles, interruptions and fallback. Fixed stale website/help identity; uncertain voice no longer triggers a second text send. | Approved number, named test participants and natural-language UAT in required languages, including interrupted full journeys. |
| Real email OTP delivery | Configuration and provider dependency; hashing/expiry/recovery can pass without inbox delivery. | `email-auth-postgres.mjs`: expiry, abuse/resends, one-time proofs, recovery races, session revocation and same-email phone continuity use real SQL and simulated transport. Real delivery remains disabled. | Approve provider/domain/from address and controlled inboxes, verify DNS/deliverability/bounces and privacy processing. Current adapter is Resend; selecting another requires a separately reviewed integration. |
| Hosted private Storage | Configuration/provider dependency; fake storage cannot prove actual bucket policies, signed URL expiry or physical deletion. Also found a configuration-validation defect. | `vault-postgres.mjs` and vault unit tests exercise outsider denial, expiry/reuse, upload lifecycle and deletion requests. HTTPS upload origin now rejects credentials, paths, query and fragments before persisting a token. Tests follow the actual generated `/api/vault/upload/…` path. | Isolated project/bucket, actual anon/auth/app identity policies, signed URL expiry, unauthorised object access, physical object deletion and retention proof. A deletion request is not deletion. |
| Actual Supabase TLS / permissions / complete restore | Missing target/configuration and hosted-system proof. Local owner access is not the app's effective grants. Historical migration directories also need target-specific reconciliation. | Exact email/shipment migrations and dedup migration exercised only in disposable PostgreSQL. Restricted role/RLS/lock rollback checks plus real 14-table pg_dump/restore; no new migration file or hosted operation. | Actual CA/hostname and least-privilege principal, complete baseline drift audit, whole-project database **and Storage** restore drill. PR #123 TLS changes remain separate. |
| Live Meta templates / windows / receipts / billing | Real-provider dependency plus confirmed success/ambiguity defects. HTTP 2xx alone formerly could become a false sent marker. | Shared message and notification clients require one usable provider ID; malformed/contradictory/oversized responses cannot prove acceptance. Shipment SQL scenarios quarantine seven malformed 2xx shapes, deny operator blind retry and ignore unrelated receipts; concurrency, window and receipt regressions pass. Legacy replay paths now commit durable attempt claims with consent/preferences/window/membership gates. | Catalog approval of exact utility template, actual recipient/window/receipt semantics, provider ambiguity investigation and explicit costs/send approval. Provider acceptance still does not mean delivered/read. |
| Carrier / SGS / banking / executed legal documents | External records and human authority, not a missing automation mandate. | Continuous lifecycle checks human-controlled documents, DLC/SGS/completion records and commission permissions. No bank instrument, payment, carrier query or legal execution performed. | Operator authenticates evidence and signs/approves as appropriate. Carrier records can be manual; do not claim a verified live feed or executed payment. |
| Legal / support / privacy-processing approval | Missing authoritative approved artifacts, publication/versions and mailbox operation. Source code cannot establish lawyer approval. | Website guidance is `https://updowncircle.site/`; help/complaint support is `udc@updowncircle.site`. Regression checks policy/consent versions. Existing policy/consent prose is byte-for-byte unchanged from the acceptance base. | Founder/lawyer supplies published approved Terms, Agent Notice and Privacy URLs, exact versions/approval record, mailbox ownership and provider/data-processing approvals. Public fetch returned HTTP 403 in this environment; publication/content were not verified. |

## Confirmed findings, ordered by severity

| Severity | Finding and fix | Evidence / limitation |
| --- | --- | --- |
| High — fixed | Legacy Meta message clients treated 2xx without a usable ID as sent. A submitted voice or network failure could provoke text fallback. Unified bounded acknowledgement validation; unknown transport outcome is explicit and suppresses fallback. | `meta-acknowledgement-safety.test.ts`: malformed matrix across text/document/interactive/reaction/voice and notification adapter, network/5xx, real voice helper. Original source with synthetic `200 {}` reproduced `{delivered:true}`. No real message was sent. |
| High — fixed | Legacy startup replays had read-before-send deduplication and no durable ambiguity claim, current-consent/window/preferences gates. Concurrent/restarted instances could repeat an uncertain send. | All three replay families now use a database transaction/advisory lock and durable audit attempt committed before Meta, recheck verified recipient/deal role and current consent/preferences/window. SQL concurrent + fresh module/restart simulation sends once per marker; absent/expired window sends nothing. Missing ID writes no sent marker. |
| Medium — fixed | A weak `https://` prefix check admitted malformed public upload origins, producing unusable/misleading secure links and unused persisted tokens. | Require a valid HTTPS root origin before insertion. Actual generated route exercised; malformed origins return unavailable and persist zero tokens. Hosted signing still unverified. |
| Medium — fixed | AKIF website and two support paths used obsolete domain/personal address, inconsistent with current founder instruction. | Shared public identity and help/complaint regressions. Approved policy/consent prose not edited. Mailbox reachability and legal publication remain unverified. |
| High activation gate — open | Hosted permissions/TLS/restore and real-provider acceptance lack evidence. | Keep credentials, replay markers and sending disabled; synthetic RLS/protocol evidence cannot close this gate. |
| High product/legal gate — open | Role activation design and approved legal publication/version provenance are unresolved. | Preserve reviewed permissions and legal text; do not represent review as activation or source text as lawyer approval. |

`delivered` is an existing legacy result-property name meaning **provider accepted**
when accompanied by an ID. Only authenticated delivery/read receipts can establish
those later states. Shipment acceptance with no ID is stored `uncertain`, never
`confirmed`. No exactly-once guarantee is claimed for the external network.

Legacy startup replays now make at most **one automatic attempt per existing
user/marker** (even a known failure needs operator review); an audit record with
`whatsapp_replay_attempted` is visible in admin audit history before any send.
Do not delete/reset that record to force a retry. A crash after claim but before
submission deliberately favours manual review over duplicate sending. Existing
sent markers remain respected. Normal automatic offer matching already persists
an approved/suggested match before presentation and routes failures to admin review;
the periodic matcher does not select that requirement again.

The single-use/expiry proofs above apply to vault **upload bearer tokens**.
Existing signed download URLs use a 300-second lifetime and may be reused during
that lifetime; this review does not claim one-time download URLs or immediate
revocation of an already issued Storage URL. API authorisation cannot prove hosted
object access control. Confirm that retention/access policy in staging before
sharing confidential evidence.

## Independent security verification scope

| Boundary | Fresh automated evidence | Limits |
| --- | --- | --- |
| Cross-account/role and private trade context | `p0-gates`, `full-mvp-lifecycle`, `commission-routes` PostgreSQL suites | Tests actual API/SQL with outsiders, unverified accounts and assigned/unassigned agents; no penetration-test certification. |
| Vault expiry/reuse and unauthorised download | `vault` and lifecycle PostgreSQL; upload-link unit tests | Storage SDK boundary simulated, actual hosted object expiry/deletion unverified. |
| OTP abuse, recovery, old sessions | `email-auth` PostgreSQL | No real mailbox or external identity-provider claim. |
| Signatures, replay, crash/concurrency | `whatsapp-webhook-retry`, `shipment-delivery`, backend HMAC regressions | Signed synthetic requests, not a configured live Meta subscription. |
| Outbox duplicate/ambiguous submissions and receipts | `shipment-delivery`, JS receipt/outbox suites, acknowledgement unit tests | Correct quarantine is evidence, not proof of final external outcome. |
| AI outages/timeouts and safe fallback | Python worker and TypeScript guidance/voice tests, onboarding/lifecycle fixtures | Real model quality/provider safety and data-processing terms remain human acceptance. |
| Grants/RLS/migration compatibility | Exact isolated migration reviews and dedup migration; local restore rehearsal | Not the hosted role, full historical migration chain or Supabase project restore. |
| Dependency security | Fresh `pnpm audit --json`, release/type/build checks | Known registry advisories at run time only. |

## Founder checklist before any controlled external activation

These are prerequisites to **separate explicit approval**; nothing below was
activated by this work. Supply secrets through protected environment settings,
never chat, Git, logs or model prompts.

- [ ] Confirm role-change staging scope or commission a separate reviewed activation
  design. Confirm published lawyer-approved Terms, Agent Notice and Privacy Policy
  URLs, versions, approval provenance and the correct consent mapping. Current
  source policy is `2026-10-21`, consent suffix `consent-v3`; that is a code fact,
  not approval evidence. Current consent points to `https://updowncircle.site/#/terms`
  and `/#/privacy`; web footer routes are local `/terms` and `/privacy`. Verify all
  actual destinations/content agree before activation; an authoritative Agent
  Notice URL/version is still missing. Confirm business support mailbox ownership
  and who handles recovery, deletion, incidents and uncertain sends.
- [ ] Name isolated staging project, test-only database/storage and operator.
  Securely bind `SUPABASE_DATABASE_URL`, approved migration/direct URL as needed,
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for the existing storage adapter and
  private `udc-documents` bucket,
  session secret, HTTPS `VAULT_PUBLIC_BASE_URL` root origin and worker auth. Use
  fake buyer/seller/agent/admin records, never production/customer copies.
- [ ] Operator verifies TLS using the actual hostname/CA chain (no insecure bypass),
  effective app principal/inherited grants, RLS/client denials, baseline migrations
  and drift. Review PR #123 separately after these requirements are known. Follow
  the existing dependency-ordered migration/lock-budget plan only after approval.
- [ ] Take consistent full database/global metadata and private-object backups in
  secure storage, restore into a second isolated target, verify ownership/counts,
  sessions/tokens, dedup/outbox/uncertain jobs and object checksums; record RPO/RTO,
  abort owner and compatible application rollback SHA. The local 14-table rehearsal
  is not this full backup. Stop scanners/sends first on rollback, retain audit and
  uncertain states; do not replay or erase them. Prior signed URLs expire on their
  original schedule. Use reviewed forward fixes/restores rather than ad hoc drops.
- [ ] Approve test WABA/app/phone ID and signed webhook binding. Provide named,
  consenting test recipients for all three roles, current consent and preferences,
  and approved utility template name/language. Catalog must say APPROVED + UTILITY,
  sole zero-variable BODY exactly: “There is an update on your UDC deal. Open My
  deals in WhatsApp to review the details you are authorized to see.” Review any
  Meta costs first. Test real within/outside-window, expiry, STOP, accepted/delivered/
  read/failed/out-of-order receipts, number recovery and uncertain-response review.
- [ ] Approve email OTP provider, verified sending domain/from address, DNS and
  test inboxes; approve bounce/rate-limit/privacy handling. No real email activation
  occurred. Confirm AI provider/model/data-processing permissions and cost scope
  before natural-language/voice UAT; never send private evidence to an unapproved AI.
- [ ] Approve a precise activation revision/target/test window and external actions
  separately. Keep shipment sending, email sending, ETA followups, window evidence,
  voice/reactions/model probes/Hermes auto-learn off/unset until each prerequisite
  is satisfied. Keep all legacy replay variables unset. Shipment's send flag is
  not a global switch for legacy replies: do not bind live Meta credentials before
  approval. Review pending queues before enabling a single worker.
- [ ] Run and retain real-provider evidence plus human buyer/seller/agent UAT,
  including secure docs, full trade progression, recovery, denial, interruption
  and rollback. Keep independent legal/banking/SGS decisions human-controlled and
  preserve DLC directly to seller / destination SGS recommendation and recorded
  explicit agreement to any alternative terms. No software approval sends funds.

## Coordination and review

The acceptance base and Instinct onboarding branch were read, not changed.
Instinct's reviewed head remains `1578783b60c38c5e4b107f923e686e1dd8107606` on
`dev/whatsapp-onboarding-ux-20261026`; acceptance remains `2ad7aa7…` at final review.
PRs #181/#182/#185 are preserved through the existing acceptance integration;
no cherry-pick, merge or parallel branch overwrite was performed here. A later
parallel revision requires a fresh diff/test review. No outbound communication
was used to coordinate; coordination here is revision/diff reconciliation.
