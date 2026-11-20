import express, { type Express, type Request } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { vaultShortRouter } from "./routes/vault";
import { logger } from "./lib/logger";
import { loadAuth } from "./auth/middleware";
import { safeRequestLogPath } from "./lib/requestLog";
import { corsOriginAllowed, parseAllowedOrigins } from "./lib/corsOrigins";
import { errorHandler } from "./lib/errorHandler";
import { SECURITY_HEADERS } from "./lib/securityHeaders";

import { policies, renderPolicy } from "./privacy/policies";

const app: Express = express();

// The app always runs behind one reverse proxy (Render). Trusting exactly one
// hop makes req.ip the real client address - taken from the proxy-appended
// X-Forwarded-For entry, which a client cannot spoof - so the per-IP auth
// budgets key per visitor instead of sharing one bucket for the whole site.
app.set("trust proxy", 1);

app.use((_req, res, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: safeRequestLogPath(req.url),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, corsOriginAllowed(origin, allowedOrigins));
    },
  }),
);
app.use(cookieParser());
app.use(
  express.json({
    verify(req, _res, buffer) {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(loadAuth);

for (const [route, [title, body]] of Object.entries(policies)) {
  app.get(route, (_req, res) => res.type("html").send(renderPolicy(title, body)));
}

app.use(vaultShortRouter);
app.use("/api", router);

const webDistPath = fileURLToPath(
  new URL("../../udc-app/dist/public/", import.meta.url),
);
const webIndexPath = path.join(webDistPath, "index.html");

if (existsSync(webIndexPath)) {
  app.use(express.static(webDistPath));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(webIndexPath, (error) => {
      if (error) next(error);
    });
  });
}

// Last middleware: fixed generic answers for anything that reached next(err).
app.use(errorHandler);

export default app;
