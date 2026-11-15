// URL SSL flags override pg's Pool.ssl option. Normalize the URL as well so
// no-verify/libpq-compatible require cannot silently disable peer verification.
export function databaseConnectionOptions(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('SUPABASE_DATABASE_URL must be a PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL must be a PostgreSQL URL.');
  }
  const host = url.searchParams.get('host') ?? url.hostname;
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host.toLowerCase());
  if (loopback && url.searchParams.get('sslmode') === 'disable') {
    return { connectionString: url.href, ssl: false as const };
  }
  // Preserve sslrootcert/client-certificate paths for pg to load, while
  // requiring both a trusted certificate chain and the expected server name.
  url.searchParams.set('sslmode', 'verify-full');
  return { connectionString: url.href, ssl: { rejectUnauthorized: true as const } };
}

// An idle pooled client can be dropped by the database or pooler. node-pg
// re-emits that on the pool as 'error'; with no listener Node treats it as an
// uncaught exception and the process exits. Log a bounded line instead.
export function attachPoolErrorLogger(
  pool: { on(event: 'error', listener: (error: Error & { code?: string }) => void): unknown },
  write: (line: string) => void = (line) => console.error(line),
) {
  pool.on('error', (error) => {
    write(JSON.stringify({
      level: 50,
      event: 'db_pool_idle_client_error',
      code: typeof error?.code === 'string' ? error.code.slice(0, 40) : undefined,
      message: String(error?.message ?? 'unknown').slice(0, 200),
    }));
  });
}
