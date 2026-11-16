import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/db/healthz", async (req, res) => {
  try {
    // Sample a few pooled sessions: a session stuck read-only (25006 on writes) still answers SELECT 1.
    const modes = await Promise.all([0, 1, 2].map(() => pool.query("SHOW transaction_read_only")));
    if (modes.some((result) => String(result.rows[0]?.transaction_read_only) === "on")) {
      req.log.error({ databaseError: { code: "25006" } }, "Database session is read-only");
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