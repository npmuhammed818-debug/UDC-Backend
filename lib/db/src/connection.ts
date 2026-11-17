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
  // Pool hygiene (recurring poisoned-session incident, 16-18 Nov): keep idle
  // connections alive and bound checkout waits. NO startup GUC override here:
  // whether this pooler mode forwards startup parameters is unverified, and a
  // read-only setting could be intentional (role/replica) - overriding it per
  // connection would fight that intent. Establish both with a disposable
  // read-only connection test before adding any startup option.
  const poolHygiene = {
    keepAlive: true as const,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
  if (loopback && url.searchParams.get('sslmode') === 'disable') {
    return { connectionString: url.href, ssl: false as const, ...poolHygiene };
  }
  // Preserve sslrootcert/client-certificate paths for pg to load, while
  // requiring both a trusted certificate chain and the expected server name.
  url.searchParams.set('sslmode', 'verify-full');
  return { connectionString: url.href, ssl: { rejectUnauthorized: true as const }, ...poolHygiene };
}

// SQLSTATE 25006: "cannot execute ... in a read-only transaction". The
// recurring incident signature: one pooled server-side session carries a
// poisoned read-only setting; writes through it fail while reads keep
// working, and node-pg returns the client to the pool on a query-level
// error, so the poisoned session circulates and failures repeat.
export const READ_ONLY_SQLSTATE = '25006';

interface ReleasableClient {
  release(error?: unknown): void;
}

export interface QueryableClient extends ReleasableClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

// Retry wrapper for transaction-mode poolers: a standalone read-only check
// and a later write can be assigned DIFFERENT server backends even on one
// client connection, so the check proves nothing on its own. Inside ONE
// explicit transaction the pooler pins a single backend for the whole
// transaction, so this runs BEGIN -> read-only check -> write -> COMMIT with
// check and write on the same backend. A still-read-only session is detected
// before the write runs; any failure rolls back and rethrows (the caller
// destroys the client: its transaction state is uncertain).
export async function transactionPinnedRetry<T, C extends QueryableClient>(
  client: C,
  runOnce: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const { rows } = await client.query("select current_setting('transaction_read_only') as ro");
    if (String(rows[0]?.ro) === "on") {
      throw Object.assign(new Error("retry session is read-only"), { code: READ_ONLY_SQLSTATE });
    }
    const result = await runOnce();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

// Run one write on a checked-out client. On 25006 the client is released
// WITH an error - node-pg destroys it instead of returning it to the
// pool - and the write is retried exactly once, with wrapRetry (see
// transactionPinnedRetry) pinning the check and write to one transaction.
// Any other error releases the client normally and is rethrown untouched.
//
// Best-effort, not a guarantee: a transaction-mode pooler may attach any
// server backend to the fresh connection; the pinned retry transaction is
// what keeps the read-only check and the write on the same backend. Any
// failure during a wrapped retry destroys the client, because its
// transaction state is uncertain.
export async function writeWithEviction<T, C extends ReleasableClient>(
  poolLike: { connect(): Promise<C> },
  run: (client: C) => Promise<T>,
  log: (line: string) => void = (line) => console.error(line),
  wrapRetry?: (client: C, runOnce: () => Promise<T>) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await poolLike.connect();
    const wrapped = attempt > 0 && !!wrapRetry;
    try {
      const result = wrapped ? await wrapRetry!(client, () => run(client)) : await run(client);
      client.release();
      return result;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : undefined;
      client.release(wrapped || code === READ_ONLY_SQLSTATE ? error : undefined);
      if (code !== READ_ONLY_SQLSTATE) throw error;
      lastError = error;
      log(JSON.stringify({ level: 50, event: 'db_write_readonly_session_evicted', attempt }));
    }
  }
  throw lastError;
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
      message: redactForLog(error?.message),
    }));
  });
}

// Bounded, redacted text for logs: connection strings, credentials and long
// token-like strings never reach the log line.
export function redactForLog(value: unknown, max = 200): string {
  return String(value ?? 'unknown')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, '[url]')
    .replace(/\b(password|passwd|pwd|secret|token|apikey|api_key|authorization|key)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, '[token]')
    .slice(0, max);
}
