import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/db/healthz", async (req, res) => {
  try {
    // Sample a few pooled sessions: a session stuck read-only (25006 on writes) still answers SELECT 1.
    // Each sample names its own session (recurring incident, 16-17 Nov): the
    // role, backend pid and setting of a poisoned session go to the log.
    // Role names only - no credentials or connection details reach the log.
    const samples = await Promise.all([0, 1, 2].map(() => pool.query(
      "select current_setting('transaction_read_only') as transaction_read_only, current_user as session_user, pg_backend_pid() as backend_pid, current_setting('default_transaction_read_only', true) as default_read_only",
    )));
    const poisoned = samples.find((result) => String(result.rows[0]?.transaction_read_only) === "on")?.rows[0];
    if (poisoned) {
      req.log.error({ databaseError: { code: "25006", poisonedSession: poisoned } }, "Database session is read-only");
      res.status(503).json({ status: "error", database: "read_only" });
      return;
    }
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    const safeError = {
      name: error instanceof Error ? error.name : "UnknownError",
      code:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined,
    };

    req.log.error(
      { databaseError: safeError },
      "Supabase database connection check failed",
    );
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

export default router;