# Commission 3-decimal migration: plan for owner review (DRAFT, NOT APPLIED)

Status: nothing here has been run against any database. The SQL lives in `docs/drafts/` (not in `lib/db/migrations`) so no tool applies it by accident.

## Why
`commissions.amount` and `commissions.commission_amount` are `numeric(18,2)`. OMR, KWD, BHD (and JOD, TND, LYD, IQD) have 3 minor units. Today the API refuses a 3-decimal amount whose third digit is not zero (409 `commission_precision_exceeds_storage`) instead of rounding it.

## What changes
- Both columns become `numeric(18,3)`. Existing values keep their value (123.45 becomes 123.450).
- No data rewrite, no new columns, no index change.
- Currency rules stay in code: JPY 0 digits, OMR/KWD/BHD 3, USD/EUR/INR/AED/SAR/QAR 2. Manual amounts are never rounded; excess precision is rejected.

## Ordered plan
1. Owner approves in writing (separate from this draft).
2. Back up (Supabase backup or `pg_dump -t public.commissions`). Record row count and sums.
3. Deploy code that already contains this PR with `UDC_COMMISSION_STORAGE_DIGITS` unset (behaviour unchanged, still refuses 3dp).
4. Apply `commission-3-decimals-forward.sql.draft` in a quiet window. It checks scale before, uses short lock/statement timeouts, and compares row count and sums after. Any mismatch aborts the transaction.
5. Update `lib/db/src/schema/commissions.ts` scale to 3 (companion commit).
6. Set `UDC_COMMISSION_STORAGE_DIGITS=3` and restart. From here 3-decimal amounts can be recorded.
7. Smoke checks: record a synthetic OMR 1500.125 on a test deal, a USD 1500.50, a JPY 250000; read all back through `/admin/commissions` and `/commissions`.

## Compatibility checks done by reading code (no execution)
- Readers get amounts as strings from pg (`routes/commissions.ts`, `whatsapp/chatUi.ts`, `services/udc.ts`, `akif/intelligence/dealContext.ts`): a string like `1500.125` flows through. Existing rows will read back as `123.450` instead of `123.45`; check any exact-string comparisons.
- Web UI (`udc-app/src/App.tsx`) converts with `Number(...)`: 3 decimals survive; display formatting not reviewed for 3 decimals.
- I found no SQL views, triggers or policies on `commissions` in `lib/db/migrations` that depend on scale. Supabase-side objects created outside the repo are unchecked.
- Order matters: widening the column BEFORE enabling the flag is safe; the reverse is not (the flag would allow inserts that the column would round).

## Rollback
`commission-3-decimals-rollback.sql.draft`. Set the flag back to 2 and redeploy first, then run it. It refuses if any row has a non-zero third decimal (that would lose data); those rows need an owner decision. If the forward script fails it is a single transaction and leaves the table unchanged.

## Tests
Executed on a local throwaway PostgreSQL 16.2 (loopback, synthetic data, never a real database), Oct 25 evening:
- `commission-migration-postgres.mjs`: 5 checks pass (existing rows preserved exactly; OMR/BHD store exactly after widening; forward refuses a second run; rollback refuses with 3dp data and restores when none).
- `commission-routes-postgres.mjs`: 7 checks pass against the real routes and SQL (manual USD/EUR/INR/AED/SAR/QAR/JPY exact; excess precision and unknown currency rejected, nothing written; calculated percentage; 3dp refused before migration; after the draft migration plus the flag OMR 1500.125 stored exactly and earlier rows unchanged; JPY/USD rules unchanged; default-commission preview).
- Unit tests (no DB): `currency-commission.test.ts`, `default-commission-rule.test.ts`.
Not covered: the real Supabase database, production data, Supabase-managed objects outside the repo, PostgreSQL version differences (local was 16.2; the CI image is pinned separately), lock behaviour under production load.
