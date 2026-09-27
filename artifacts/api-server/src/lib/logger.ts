import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body",
    "res.headers['set-cookie']",
    // Upstream SDK errors can include request details, provider response bodies,
    // and stack traces. Keep the structured error name/status logged by callers,
    // but never retain those opaque values in production logs.
    "err.message",
    "err.stack",
    "error.message",
    "error.stack",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
