import app from "./app";
import { logger } from "./lib/logger";
import { startAkifResearchQueueRunner } from "./akif/intelligence/researchQueueRunner";
import { checkWhatsAppConnection, ensureWhatsAppWebhookSubscription } from "./whatsapp/client";
import { replayDealStatusWhatsAppNotification, replayDealSummaryWhatsAppNotification, replayVerificationWhatsAppNotifications } from "./whatsapp/replayVerificationNotifications";

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
  void Promise.all([
    checkWhatsAppConnection(),
    ensureWhatsAppWebhookSubscription(),
  ]).then(async ([whatsapp, subscription]) => {
    if (whatsapp.ok) {
      logger.info({ whatsapp }, "WhatsApp phone access check completed; delivery still requires a message test");
    } else {
      logger.warn({ whatsapp }, "WhatsApp phone management read check failed; continuing with webhook subscription check");
    }

    if (subscription.ok) {
      logger.info({ subscription }, "WhatsApp WABA webhook subscription confirmed");
      const replay = await replayVerificationWhatsAppNotifications();
      if (replay.configured) {
        logger.info({ replay }, "WhatsApp verification notification replay completed");
      }

      const dealStatusReplay = await replayDealStatusWhatsAppNotification();
      if (dealStatusReplay.configured) {
        logger.info({ replay: dealStatusReplay }, "WhatsApp deal status replay completed");
      }

      const dealSummaryReplay = await replayDealSummaryWhatsAppNotification();
      if (dealSummaryReplay.configured) {
        logger.info({ replay: dealSummaryReplay }, "WhatsApp deal summary replay completed");
      }
    } else {
      logger.error({ subscription }, "WhatsApp WABA webhook subscription failed");
    }
  });
});
