// Standalone, dependency-free probe handler factory so the security
// properties (auth ordering, zero work when rejected) stay unit-testable.

// Isolated write-health diagnostic (18 Nov outage): ONE real write through the
// app pool inside a transaction that is ALWAYS rolled back - no business,
// session, outbound or dedup state changes durably. Exists so write health
// can be proven without waiting for a customer message.
// Security: admin-role auth (requireRole runs first, so an unauthorized
// request does zero database work), POST only, UDC_DB_WRITE_PROBE=1 required,
// one probe per process per 30s, Cache-Control: no-store, and no backend pid
// or internals in the response (pid goes to the server log only).
const PROBE_MIN_INTERVAL_MS = 30_000;

interface ProbeClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(error?: unknown): void;
}

export function makeWriteProbeHandler(
  deps: { connect(): Promise<ProbeClient> },
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
    let client: ProbeClient;
    try {
      client = await deps.connect();
    } catch {
      res.status(503).json({ status: "error", database: "unavailable" });
      return;
    }
    let rolledBack = false;
    try {
      await client.query("BEGIN");
      // A unique throwaway key: even before the rollback nothing real is touched.
      await client.query("INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)", [`__write_probe__${at}`]);
      const meta = await client.query("select current_setting('transaction_read_only') as ro, pg_backend_pid() as pid");
      await client.query("ROLLBACK");
      rolledBack = true;
      log(JSON.stringify({ level: 30, event: "db_write_probe_ok", backend_pid: meta.rows[0]?.pid }));
      res.status(200).json({ status: "ok", write: "rollback_only", transaction_read_only: meta.rows[0]?.ro });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? String((error as { code?: unknown }).code).slice(0, 10)
          : undefined;
      log(JSON.stringify({ level: 50, event: "db_write_probe_failed", code }));
      res.status(503).json({ status: "error", database: "write_failed", code });
    } finally {
      if (!rolledBack) {
        try {
          await client.query("ROLLBACK");
          rolledBack = true;
        } catch {
          // rollback failed: destroy below
        }
      }
      // Destroy-on-rollback-failure; a cleanly rolled-back session returns.
      client.release(rolledBack ? undefined : new Error("db write probe rollback failed"));
    }
  };
}

