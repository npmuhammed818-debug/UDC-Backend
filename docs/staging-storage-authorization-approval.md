# Real Supabase storage authorization check

Owner approval (WhatsApp, 10:01:38 PM Oct 25): one separate free-tier Supabase test project, synthetic data only, no production credentials, no paid upgrade. Owner instruction 10:19:06 PM: fix the check in PR #179 and run it against that project.

Run (never against production):
SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_ROLE_KEY=... node scripts/staging/storage-authorization-check.mjs

It creates a temporary private bucket, uploads synthetic PDFs for two fake companies, checks anonymous and signed-in-user denial, signed URL success, tamper and cross-company rejection, expiry, then deletes everything it made.
Status: see the PR description for whether it has been run.
