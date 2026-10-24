# PostgreSQL TLS verification

The API verifies the database server's certificate chain and hostname. Connection URLs are normalized to `sslmode=verify-full`, including URLs with `no-verify`, `require` or libpq compatibility flags. This prevents URL options from overriding the driver's secure setting.

Publicly trusted database certificates use Node's normal trust store. If the database requires its own CA, obtain that public CA certificate from the database provider through an authenticated source, retain it in the environment, and reference its absolute path with the existing PostgreSQL URL option `sslrootcert`. Existing `sslcert` and `sslkey` paths remain supported for client certificates. Never commit connection credentials or private keys.

An explicit `sslmode=disable` is permitted only for `localhost`, `127.0.0.1` or IPv6 loopback development targets. A `host` URL override is considered when making this decision. Remote plaintext settings are upgraded to verified TLS.

Before approving deployment, validate the actual Supabase/pooler hostname and its certificate chain. A server without a trusted certificate will now be rejected; configure the correct CA rather than disabling verification. This change does not supply or change production credentials, CA files or environment settings.

`artifacts/api-server/test/database-tls.test.ts` creates ephemeral local test certificates and uses the real pg client to check rejection of untrusted certificates, weak URL flags and a trusted certificate with the wrong hostname. It also verifies that an explicitly trusted certificate connects. The test uses OpenSSL, available in the Ubuntu CI runner, and never connects to a real database provider.

## Render CA file deployment checklist — PREPARATION ONLY

Evidence (owner-run, certificate-only, 23 October 2026):
- Confirmed transaction pooler: `aws-0-ap-south-1.pooler.supabase.com:6543`.
- `openssl s_client -starttls postgres` with `-CAfile`, `-verify_hostname` and `-verify_return_error` returned `Verification: OK`; negotiated TLS 1.3. No credentials or SQL were used.
- Owner-downloaded public Supabase Root 2021 CA certificate: `prod-ca-2021.crt`; not valid after 26 April 2031.
- SHA-256 certificate fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. This is identifying evidence only, not a substitute for obtaining the CA through the authenticated Supabase dashboard.

Do NOT perform the steps below on production without the owner's separate explicit approval:
1. Prepare an isolated **non-production** Render service/database first, not the UDC live service. Use fictional records and non-production credentials only.
2. In that service's Environment > Secret Files, create the **public CA** file named `prod-ca-2021.crt`, copying the exact PEM certificate from the authenticated Supabase dashboard (not any private key). On Render it is available at `/etc/secrets/prod-ca-2021.crt`.
3. Set the QA PostgreSQL URL's `sslrootcert` query parameter to `/etc/secrets/prod-ca-2021.crt` and `sslmode=verify-full`; preserve the original password and all other connection parameters. For illustration only (not a usable credential-bearing URL): `postgresql://user@example.invalid/postgres?sslmode=verify-full&sslrootcert=%2Fetc%2Fsecrets%2Fprod-ca-2021.crt`.
4. Be aware: **saving a Render Secret File or environment change causes deployment**. Do not save changes to a production service before approval, even if the file itself is public.
5. Validate with the real Node `pg` client in QA using a non-production database, check correct CA+hostname acceptance, wrong-CA and wrong-hostname rejection, auth behavior and logs. The OpenSSL certificate-only probe does not establish application compatibility.
6. Only after QA succeeds and owner approval is obtained should a production configuration/deployment sequence be planned, including rollback and verifying the expected deployment branch.
7. Keep migration connections (`SUPABASE_DIRECT_URL`, when used) separate from transaction pooling and review their certificate trust and migrations independently.

Never disable verification as a workaround. A missing or wrong CA must block the TLS connection rather than silently falling back to unverified TLS. Avoid pasting database passwords into logs, pull requests or screenshots.
