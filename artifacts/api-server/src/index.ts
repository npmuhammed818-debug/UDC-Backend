import app from "./app";
import { logger } from "./lib/logger";
import { startAkifResearchQueueRunner } from "./akif/intelligence/researchQueueRunner";
import { checkWhatsAppConnection } from "./whatsapp/client";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startAkifResearchQueueRunner();
  void checkWhatsAppConnection().then((whatsapp) => {
    if (whatsapp.ok) logger.info({ whatsapp }, "WhatsApp credential check completed; delivery still requires a message test");
    else logger.error({ whatsapp }, "WhatsApp credential check failed");
  });
});
