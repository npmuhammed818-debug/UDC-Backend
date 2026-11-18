// Standalone, dependency-free probe handler factory so the security
// properties (auth ordering, zero work when rejected) stay unit-testable.
// The real dbWrite retry wrapper is injected from the route wiring so this
// probe exercises the EXACT production candidate path (plain write attempt ->
// 25006 eviction -> pinned retry with BEGIN READ WRITE), with one deliberate
// difference: every transaction ends in ROLLBACK, never COMMIT.

// Isolated write-health diagnostic (18 Nov outage): ONE real write through the
// app pool inside transactions that are ALWAYS rolled back - no business,
// session, outbound or dedup state changes durably. Exists so write health
// can be proven without waiting for a customer message.
// Security: admin-role auth (requireRole runs first, so an unauthorized
// request does zero database work), POST only, UDC_DB_WRITE_PROBE=1 required,
// one probe per process per 30s, Cache-Control: no-store, and no backend pid
// or internals in the response (pid/state go to the server log only).
const PROBE_MIN_INTERVAL_MS = 30_000;

interface ProbeClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(error?: unknown): void;
}

interface ProbeDeps {
  connect(): Promise<ProbeClient>;
  // The production pinned retry (transactionPinnedRetry from @workspace/db),
  // wired with terminator "rollback": BEGIN READ WRITE -> read-only check ->
  // runOnce -> ROLLBACK. Throws code 25006 when the retry session is still
  // read-only or the target has an intentional read-only default.
  wrapRetry<T>(client: ProbeClient, runOnce: () => Promise<T>): Promise<T>;
}

const READ_ONLY = "25006";

export function makeWriteProbeHandler(
  deps: ProbeDeps,
  now: () => number = () => Date.now(),
  log: (line: string) => void = (line) => console.error(line),
) {
  let lastProbeAt = 0;
  return async (_req: unknown, res: { setHeader(n: string, v: string): void; status(code: number): { json(body: unknown): void } }) => {
    res.setHeader("Cache-Control", "no-store");
    if (process.env.UDC_DB_WRITE_PROBE !== "1") {
      res.status(404).json({ status: "disabled" });
      return;
    }
    const at = now();
    if (at - lastProbeAt < PROBE_MIN_INTERVAL_MS) {
      res.status(429).json({ status: "rate_limited" });
      return;
    }
    lastProbeAt = at;

    const fail = (error: unknown) => {
      const code =
        typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? String((error as { code?: unknown }).code).slice(0, 10)
          : undefined;
      log(JSON.stringify({ level: 50, event: "db_write_probe_failed", code }));
      res.status(503).json({ status: "error", database: "write_failed", code });
    };
    const errorCode = (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : undefined;

    // Attempt 1: plain transaction, exactly as the pre-repair write path ran
    // (plain BEGIN inherits a poisoned session default -> 25006). The ro/pid
    // sample goes to the log only, so the log records backend/state before the
    // pinned transaction.
    let client: ProbeClient;
    try {
      client = await deps.connect();
    } catch {
      res.status(503).json({ status: "error", database: "unavailable" });
      return;
    }
    try {
      await client.query("BEGIN");
      const meta = await client.query("select current_setting('transaction_read_only') as ro, pg_backend_pid() as pid");
      log(JSON.stringify({ level: 30, event: "db_write_probe_state", phase: "plain", backend_pid: meta.rows[0]?.pid, transaction_read_only: meta.rows[0]?.ro }));
      // A unique throwaway key: even before the rollback nothing real is touched.
      await client.query("INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)", [`__write_probe__${at}`]);
      await client.query("ROLLBACK");
      client.release();
      log(JSON.stringify({ level: 30, event: "db_write_probe_ok", attempts: 1 }));
      res.status(200).json({ status: "ok", write: "rollback_only", attempts: 1, transaction_read_only: meta.rows[0]?.ro });
      return;
    } catch (first) {
      const rolledBack = await client.query("ROLLBACK").then(() => true).catch(() => false);
      if (errorCode(first) !== READ_ONLY) {
        // Non-25006 failure: not the poisoned-session signature - report; the
        // session returns only when its rollback succeeded.
        client.release(rolledBack ? undefined : first);
        fail(first);
        return;
      }
      // 25006: evict the poisoned session (release WITH error destroys it,
      // matching writeWithEviction) and run the EXACT candidate pinned retry
      // on a fresh client.
      client.release(first);
      log(JSON.stringify({ level: 50, event: "db_write_probe_evicted_plain_session" }));
    }

    // Attempt 2: the candidate retry itself (BEGIN READ WRITE -> check ->
    // write -> ROLLBACK). runOnce re-samples ro after the write so the
    // response reflects the retried transaction's own state.
    let retryClient: ProbeClient;
    try {
      retryClient = await deps.connect();
    } catch {
      res.status(503).json({ status: "error", database: "unavailable" });
      return;
    }
    try {
      const ro = await deps.wrapRetry(retryClient, async () => {
        await retryClient.query("INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)", [`__write_probe__${at}`]);
        const meta = await retryClient.query("select current_setting('transaction_read_only') as ro");
        return String(meta.rows[0]?.ro);
      });
      retryClient.release();
      log(JSON.stringify({ level: 30, event: "db_write_probe_ok", attempts: 2, retried: true }));
      res.status(200).json({ status: "ok", write: "rollback_only", attempts: 2, retried: true, transaction_read_only: ro });
    } catch (second) {
      // A wrapped failure destroys the client: its transaction state is
      // uncertain (matches writeWithEviction semantics).
      retryClient.release(second);
      fail(second);
    }
  };
}
