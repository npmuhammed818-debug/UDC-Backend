# Supabase TLS compatibility — separate from #119–122

Read-only investigation, 23 October 2026. PR #123 remains separate. No production
connection, query, enforcement toggle, deployment or configuration change was made.
No certificate-verification bypass was used.

## Confirmed from official documentation

- [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement):
  `require` encrypts without proving server identity; `verify-full` verifies CA
  and hostname. Download the project's CA certificate from Database Settings when
  needed, and supply it as trusted CA material. Enforcement alone does not replace
  client-side verification. Changing enforcement restarts the database; do not do
  this as a compatibility probe.
- [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres):
  direct connections normally require IPv6; the shared session pooler supports IPv4
  and persistent backends. Transaction pooling has different session semantics.
  Use the actual hostname/port from the project's Connect panel; the pooler cluster
  hostname cannot safely be inferred from region. Do not purchase an IPv4 add-on.
- The site was unavailable through this environment's HTTP proxy (403); the same
  official MDX sources were read successfully through GitHub's Supabase repository:
  `apps/docs/content/guides/platform/ssl-enforcement.mdx` and
  `apps/docs/content/guides/database/connecting-to-postgres.mdx`.

## PR #123 assessment and unresolved compatibility

Its selected head `232efa1f6d9433c2d8fcd775141a10969d8d8ec7` normalizes remote
connections to `verify-full`, preserves `sslrootcert` paths, and allows explicit
plaintext only for loopback test databases. Its existing local TLS regressions
exercise trusted/untrusted chains and hostname rejection, but cannot establish
compatibility with this project's actual endpoint or CA.

The integration environment has no Supabase project URL/database binding. The
actual database/pooler hostname, port, network reachability and certificate issuer
are therefore **NOT YET TESTED**. No host, CA or production connection change is
being guessed. Default OS trust may be insufficient for a project-specific CA;
strict failure is preferable to silently accepting an untrusted server.

Next: obtain only the public hostname/port and official project CA if required;
perform a PostgreSQL STARTTLS handshake with chain and hostname verification and
no database authentication or SQL. Then validate #123 separately against a
non-production database using the same endpoint class, CA and client library.
Report DNS/IPv4/IPv6, certificate identity/trust/expiry and authentication separately.
Never use `rejectUnauthorized:false`, `sslmode=no-verify`, `NODE_TLS_REJECT_UNAUTHORIZED=0`
or an SSL-enforcement change as a workaround. Owner approval is required for any
production configuration or deployment change.
