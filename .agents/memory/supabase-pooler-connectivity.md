---
name: Supabase pooler connectivity
description: Environment-specific guidance for connecting this backend to Supabase PostgreSQL.
---

Use Supabase's IPv4 shared pooler for the running backend instead of the direct `db.<project-ref>.supabase.co` host. Runtime uses transaction mode on port 6543; session mode on port 5432 is reserved for migration operations.

**Why:** The direct Supabase database hostname did not resolve from this environment, while the shared pooler connected successfully once the URL used the correct pooler username and URL-encoded database password.

**How to apply:** Keep the runtime connection in `SUPABASE_DATABASE_URL` and use `SUPABASE_DIRECT_URL` for migration tooling. Never put either connection string in source code.