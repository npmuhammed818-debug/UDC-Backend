import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger.ts";

// Final error handler. Express's default handler sends the stack trace in the
// response when NODE_ENV is not "production" - an internals leak. This handler
// answers with a fixed generic body and logs only a bounded message server-side.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = (err as { status?: unknown } | null)?.status;
  const safeStatus =
    typeof status === "number" && status >= 400 && status < 500 ? status : 500;
  const message = err instanceof Error ? err.message.slice(0, 200) : "unknown";
  (req.log ?? logger).error(
    { event: "unhandled_request_error", status: safeStatus, message },
    "Unhandled request error",
  );
  if (res.headersSent) return;
  res.status(safeStatus).json({
    error:
      safeStatus === 400
        ? "invalid_request_body"
        : safeStatus === 413
          ? "request_too_large"
          : "internal_error",
  });
}
