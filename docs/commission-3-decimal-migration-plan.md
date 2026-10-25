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
- Run in this change (no database): `currency-commission.test.ts` and `default-commission-rule.test.ts` cover currency precision, manual amounts, calculated amounts, legacy no-currency callers, the storage guard and the flag.
- Written, NOT executed: `artifacts/api-server/test/integration/commission-migration-postgres.mjs` applies the drafts to an isolated synthetic loopback database (name must match `udc_qa_commission_*`) and checks existing rows are preserved, 3dp values store exactly after widening, the rollback refuses with 3dp rows and works without them. No Postgres server was available where this was authored.
- Not covered: the HTTP routes against an app with a database; production data.
