# PostgreSQL TLS verification

The API verifies the database server's certificate chain and hostname. Connection URLs are normalized to `sslmode=verify-full`, including URLs with `no-verify`, `require` or libpq compatibility flags. This prevents URL options from overriding the driver's secure setting.

Publicly trusted database certificates use Node's normal trust store. If the database requires its own CA, obtain that public CA certificate from the database provider through an authenticated source, retain it in the environment, and reference its absolute path with the existing PostgreSQL URL option `sslrootcert`. Existing `sslcert` and `sslkey` paths remain supported for client certificates. Never commit connection credentials or private keys.

An explicit `sslmode=disable` is permitted only for `localhost`, `127.0.0.1` or IPv6 loopback development targets. A `host` URL override is considered when making this decision. Remote plaintext settings are upgraded to verified TLS.

Before approving deployment, validate the actual Supabase/pooler hostname and its certificate chain. A server without a trusted certificate will now be rejected; configure the correct CA rather than disabling verification. This change does not supply or change production credentials, CA files or environment settings.

`artifacts/api-server/test/database-tls.test.ts` creates ephemeral local test certificates and uses the real pg client to check rejection of untrusted certificates, weak URL flags and a trusted certificate with the wrong hostname. It also verifies that an explicitly trusted certificate connects. The test uses OpenSSL, available in the Ubuntu CI runner, and never connects to a real database provider.
