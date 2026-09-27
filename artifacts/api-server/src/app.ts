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

app.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>UDC Privacy Policy</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}
    h1,h2{line-height:1.2} small{color:#555}
  </style>
</head>
<body>
  <h1>UDC Privacy Policy</h1>
  <small>Last updated: 27 September 2026</small>
  <p>UDC (UpDownCircle) is a B2B trade execution platform that helps buyers, sellers and trade participants communicate, submit trade requirements, review opportunities and coordinate trade-related workflows.</p>

  <h2>Information we may process</h2>
  <p>Depending on how you use UDC, we may process contact details, WhatsApp identifiers, message content you send to UDC, buyer requirements, seller offers, product and shipment details, documents you choose to provide, and technical logs needed to operate and secure the service.</p>

  <h2>How we use information</h2>
  <p>We use information to provide UDC services, respond to messages, process trade requests, support verification and review workflows, maintain security, prevent abuse, troubleshoot service problems, and improve product reliability. UDC does not treat an automated result as final approval of a company, payment, shipment, compliance decision, or trade document.</p>

  <h2>WhatsApp and service providers</h2>
  <p>If you communicate with UDC through WhatsApp, your messages are processed through Meta's WhatsApp Business Platform and UDC's service providers. Those providers may process data under their own terms and privacy policies.</p>

  <h2>Sharing</h2>
  <p>UDC does not sell personal information. Information may be shared only as needed to operate the service, comply with law, protect users, or complete a workflow you request.</p>

  <h2>Retention and security</h2>
  <p>UDC aims to retain information only as long as reasonably necessary for service operation, legal or compliance needs, dispute handling, and security. We use access controls and other reasonable safeguards, but no online service can guarantee absolute security.</p>

  <h2>Your choices</h2>
  <p>You may stop messaging UDC at any time. You may also request access, correction or deletion of information associated with your use of UDC, subject to legal and compliance retention requirements.</p>

  <h2>Data deletion</h2>
  <p>Instructions for requesting deletion are available at <a href="/data-deletion">/data-deletion</a>.</p>

  <h2>Changes</h2>
  <p>This policy may be updated as UDC develops. Material changes will be reflected on this page.</p>
</body>
</html>`);
});

app.get("/data-deletion", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>UDC Data Deletion</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}
  </style>
</head>
<body>
  <h1>UDC Data Deletion Instructions</h1>
  <p>To request deletion of personal information associated with your use of UDC, contact UDC through the same official support or WhatsApp channel you used to access the service and state that you are requesting data deletion.</p>
  <p>UDC may ask for reasonable information to verify your identity and locate the relevant account or records. Some records may be retained where required for legal, security, fraud-prevention, compliance, accounting, or dispute-resolution purposes.</p>
</body>
</html>`);
});

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
