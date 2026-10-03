import express, { type Express, type Request } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadAuth } from "./auth/middleware";

import { policies, renderPolicy } from "./privacy/policies";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
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
app.use(cors());
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

export default app;
