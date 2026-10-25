# Real Supabase storage authorization: what must be approved before it runs

Status: script written, NOT run. Nothing here touches production or real customer data.

## What the owner must approve (exact request)
1. Create or name ONE isolated STAGING Supabase project (not the production project) with the migrations applied from the draft chain. This may cost money on a paid Supabase plan: owner decides.
2. Allow Instinct to deploy the draft chain to ONE staging API host (not production), with staging-only env values.
3. Allow two SYNTHETIC verified buyer accounts in two different synthetic companies (no real people, no real documents).
4. Allow running scripts/staging/storage-authorization-check.mjs against that staging project.

## What it proves
Private bucket (anonymous read and list fail), single-use upload links, owner sees status only, cross-company access (list, delete) denied, signed URLs work for participants, fail for a tampered path, and expire (manual wait step).

## Not covered
Production bucket policies, real documents, Supabase dashboard settings drift, backups.

## Run
STAGING_API_BASE=... STAGING_SUPABASE_URL=... STAGING_SUPABASE_ANON_KEY=... COMPANY_A_COOKIE=... COMPANY_B_COOKIE=... [DEAL_ID_WITH_APPROVED_DOC=...] node scripts/staging/storage-authorization-check.mjs
Secrets stay in the environment and are never printed.
