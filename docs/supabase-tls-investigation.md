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

## Owner-confirmed direct endpoint follow-up

The owner confirmed `db.aykylupvkdrnoivmktfg.supabase.co:5432` as the direct
endpoint and authorized only a read-only certificate check. This is **not** a
confirmed production pooler endpoint.

The following certificate-only probe was attempted, without credentials or SQL:

```sh
openssl s_client -starttls postgres \
  -connect db.aykylupvkdrnoivmktfg.supabase.co:5432 \
  -servername db.aykylupvkdrnoivmktfg.supabase.co \
  -verify_hostname db.aykylupvkdrnoivmktfg.supabase.co \
  -verify_return_error -brief < /dev/null
```

**BLOCKED — direct endpoint:** local DNS returned `EAI_AGAIN` / “Temporary failure
in name resolution”; OpenSSL exited before connecting. No peer certificate was
received, so neither trust, identity nor expiry can be judged. This is an
environment/reachability failure, not evidence of an invalid server certificate.

**BLOCKED — production transaction pooler:** port 6543 has been used, but its exact
hostname is unconfirmed. Do not assume the direct host is the pooler or guess a
pooler cluster name. No production pooler handshake was attempted.

Next: repeat the strict direct certificate-only probe from an environment with
working DNS and endpoint reachability; obtain the official project CA if required.
Obtain the actual production pooler hostname before testing it separately. Then
validate #123 against a non-production database using the same endpoint class,
CA and client library. Report DNS/IPv4/IPv6, certificate identity/trust/expiry and
authentication separately. Existing local TLS tests cannot substitute for this.
Never use `rejectUnauthorized:false`, `sslmode=no-verify`, `NODE_TLS_REJECT_UNAUTHORIZED=0`
or an SSL-enforcement change as a workaround. Owner approval is required for any
production configuration or deployment change.
