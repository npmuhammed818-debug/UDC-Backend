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

// drizzle wraps pg errors (DrizzleQueryError carries the pg error as .cause),
// so the SQLSTATE can live one or more cause hops below the thrown object.
// Follow the cause chain; without this a drizzle-issued write that fails
// 25006 is misclassified as an ordinary error and never retried (caught by
// the loopback contamination check, 18 Nov).
export function sqlstateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

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
// transaction, so this runs BEGIN READ WRITE -> read-only check -> write ->
// COMMIT with check and write on the same backend. BEGIN READ WRITE makes the
// transaction explicitly writable: a server backend whose session carries a
// leaked `SET default_transaction_read_only TO 'on'` (the recurring 16-18 Nov
// poison: session-level state from another pooler client persists on
// transaction-mode backends and 25006s every later write) is overridden for
// THIS transaction only - no session state is mutated and nothing leaks to
// the next borrower.
//
// Safety note (verified against the PostgreSQL SET TRANSACTION / hot-standby
// docs, 18 Nov): BEGIN READ WRITE overrides only the session default
// (default_transaction_read_only) for this one transaction. It cannot make a
// genuine read-only server writable: on a hot standby transaction_read_only
// is always true and any command that explicitly sets non-read-only state
// (SET TRANSACTION READ WRITE / BEGIN READ WRITE) errors, so a replica target
// still fails closed here instead of writing.
//
// Intent guard: an intentional read-only intent for this database/role lives
// in persistent configuration (ALTER DATABASE / ALTER ROLE / config file),
// which pg_settings reports with source 'database' / 'role' / 'configuration
// file' (etc.). The incident poison is a LEAKED SESSION SET on a pooled
// backend, source 'session'. The retry overrides ONLY the leaked-session
// case; when the session default is read-only from an intentional persistent
// source it fails closed instead of overriding someone's deliberate choice.
//
// Options: terminator "rollback" (diagnostic probes only) proves the exact
// retry mechanics without persisting anything; log receives one internal
// state line (backend pid + read-only flags + default source inside the
// pinned transaction) - never part of any HTTP response.
export interface PinnedRetryOptions {
  terminator?: "commit" | "rollback";
  log?: (line: string) => void;
}
// The override decision must NOT rest on pg_settings.source alone: source is
// the MECHANISM that applied the visible value, not intent, and a session SET
// MASKS lower-priority deliberate defaults (role/database/config). So the
// state query independently consults authoritative configuration: boot_val
// (config-file value) and pg_db_role_setting (ALTER ROLE / ALTER DATABASE
// entries applicable to the current role and database). Only when NONE of
// those declares read-only is the session value treated as leaked poison.
export const PINNED_STATE_QUERY =
  "select current_setting('transaction_read_only') as ro, current_setting('default_transaction_read_only') as default_ro, " +
  "(select source from pg_settings where name = 'default_transaction_read_only') as default_source, " +
  "(select boot_val from pg_settings where name = 'default_transaction_read_only') as boot_ro, " +
  "exists(select 1 from pg_db_role_setting s where (s.setrole = current_user::regrole or s.setrole = 0) " +
  "and (s.setdatabase = (select oid from pg_database where datname = current_database()) or s.setdatabase = 0) " +
  "and exists(select 1 from unnest(s.setconfig) c where c ilike 'default_transaction_read_only=on')) as persistent_ro, " +
  "pg_backend_pid() as pid";
// Intent rule (verified against a real PG 14 server, 18 Nov): pg_settings
// reports a session-leaked SET as source 'session'; every deliberate source
// reports something else - ALTER ROLE => 'user' (NOT 'role'), ALTER DATABASE
// => 'database', config file => 'configuration file', PGOPTIONS/client
// options => 'client'. The guard is INVERTED on purpose: only source
// 'session' is overridable, so a source this list did not anticipate fails
// closed instead of silently overriding someone's deliberate read-only.
const OVERRIDABLE_DEFAULT_SOURCE = "session";
export async function transactionPinnedRetry<T, C extends QueryableClient>(
  client: C,
  runOnce: () => Promise<T>,
  opts?: PinnedRetryOptions,
): Promise<T> {
  await client.query("BEGIN READ WRITE");
  try {
    const { rows } = await client.query(PINNED_STATE_QUERY);
    const state = rows[0] ?? {};
    opts?.log?.(JSON.stringify({
      level: 30,
      event: "db_pinned_tx_state",
      backend_pid: state.pid,
      transaction_read_only: state.ro,
      default_read_only: state.default_ro,
      default_source: state.default_source,
      rollback_only: opts?.terminator === "rollback" ? true : undefined,
    }));
    if (String(state.ro) === "on") {
      // Still read-only inside BEGIN READ WRITE: hard read-only target (for
      // example a hot standby). Never writable; fail closed.
      throw Object.assign(new Error("retry session is read-only"), { code: READ_ONLY_SQLSTATE });
    }
    const persistentReadOnly =
      state.persistent_ro === true || String(state.persistent_ro) === "t" || String(state.boot_ro) === "on";
    if (String(state.default_ro) === "on" && (String(state.default_source) !== OVERRIDABLE_DEFAULT_SOURCE || persistentReadOnly)) {
      // An intentional configured read-only default: either the visible value
      // comes from a non-session source, or authoritative configuration
      // (role/database entry, config file) declares read-only UNDERNEATH a
      // session-level mask. Do not override a deliberate choice. Fail closed.
      throw Object.assign(new Error(`target has an intentional read-only default (source ${state.default_source}, persistent ${persistentReadOnly})`), { code: READ_ONLY_SQLSTATE });
    }
    const result = await runOnce();
    await client.query(opts?.terminator === "rollback" ? "ROLLBACK" : "COMMIT");
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
      const code = sqlstateOf(error);
      client.release(wrapped || code === READ_ONLY_SQLSTATE ? error : undefined);
      if (code !== READ_ONLY_SQLSTATE) throw error;
      lastError = error;
      log(JSON.stringify({ level: 50, event: 'db_write_readonly_session_evicted', attempt }));
    }
  }
  throw lastError;
}

// Whole-transaction variant of writeWithEviction for call sites whose work is
// already a multi-statement transaction (auth login/signin, rate-limit budget
// charges). The FIRST attempt runs BEGIN -> body -> COMMIT on one checked-out
// client, exactly what drizzle .transaction did before. On SQLSTATE 25006 the
// client is destroyed (poisoned session evicted) and the ENTIRE body re-runs
// once inside transactionPinnedRetry (BEGIN READ WRITE + read-only intent
// guard) on a fresh backend - no session state is mutated and the retry keeps
// the same atomicity guarantees: the poisoned attempt rolled back before
// eviction, so the retried body is the only one that can commit.
//
// Two hard requirements on callers:
// 1. The body must have NO side effects outside the database transaction
//    (no outbound sends, no cache writes): after a 25006 mid-transaction the
//    attempt rolls back and the body executes a second time.
// 2. The body must not open its own transaction on the executor; the helper
//    owns BEGIN/COMMIT (a nested BEGIN would warn and an inner COMMIT would
//    commit the outer transaction early).
//
// Fail-closed cases are inherited from transactionPinnedRetry: a still-
// read-only retry transaction (hot standby) and an intentional read-only
// default (role/database/config source) both abort without writing.
export async function transactionWithEviction<T, C extends QueryableClient, E>(
  poolLike: { connect(): Promise<C> },
  makeExecutor: (client: C) => E,
  body: (tx: E) => Promise<T>,
  log: (line: string) => void = (line) => console.error(line),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await poolLike.connect();
    // Set when ROLLBACK itself fails or the error came from BEGIN/COMMIT: the
    // transaction outcome is then UNKNOWN (a COMMIT transport failure may
    // still have committed server-side). Such a client is always destroyed,
    // never returned to the pool.
    //
    // Retry-safety boundary (review point, 18 Nov): outcomeUncertain does NOT
    // gate the retry decision, because the retry key is SQLSTATE 25006 itself
    // - and a 25006 can only arrive as a PostgreSQL ErrorResponse message,
    // which is the SERVER DEFINITIVELY stating the transaction was aborted.
    // That is the opposite of ambiguity:
    //   - body-stage 25006: the statement error already aborted the tx
    //     (ROLLBACK is cleanup only; even if ROLLBACK's own transport fails,
    //     the server discards the aborted tx when the connection dies).
    //   - COMMIT-stage 25006 (deferred write trigger): the server REFUSED the
    //     commit - nothing was written.
    //   - BEGIN-stage 25006 (hot standby): no transaction ever started.
    // The genuinely ambiguous case - a COMMIT whose response is LOST in
    // transit - carries NO SQLSTATE (node-pg raises a bare Error), so it is
    // never retried here; it is destroyed and surfaced. A fabricated 25006
    // from the pooler is also safe: the pooler speaks for the server and
    // never confirms a commit it then reports as refused.
    let outcomeUncertain = false;
    try {
      let result: T;
      if (attempt === 0) {
        let stage: "begin" | "body" | "commit" = "begin";
        try {
          await client.query("BEGIN");
          stage = "body";
          result = await body(makeExecutor(client));
          stage = "commit";
          await client.query("COMMIT");
        } catch (error) {
          // A failed BEGIN never started a transaction (connection suspect);
          // a failed COMMIT leaves the outcome ambiguous - it may have
          // committed server-side even when a later ROLLBACK answers. Only a
          // body-stage error followed by a SUCCESSFUL rollback leaves the
          // client provably clean and the body provably uncommitted.
          if (stage !== "body") outcomeUncertain = true;
          const rolledBack = await client.query("ROLLBACK").then(() => true, () => false);
          if (!rolledBack) outcomeUncertain = true;
          throw error;
        }
      } else {
        result = await transactionPinnedRetry(client, () => body(makeExecutor(client)), { log });
      }
      client.release();
      return result;
    } catch (error) {
      const code = sqlstateOf(error);
      // Destroy the client on the pinned retry (transaction state uncertain),
      // whenever the session is read-only-poisoned, and whenever rollback or
      // BEGIN/COMMIT transport left the outcome unknown; only a clean
      // rollback after a body error makes the client reusable.
      client.release(attempt > 0 || outcomeUncertain || code === READ_ONLY_SQLSTATE ? error : undefined);
      if (code !== READ_ONLY_SQLSTATE) throw error;
      lastError = error;
      log(JSON.stringify({ level: 50, event: 'db_tx_readonly_session_evicted', attempt }));
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
