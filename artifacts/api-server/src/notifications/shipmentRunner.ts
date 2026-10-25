import { dispatchShipmentNotifications } from './shipmentDispatcher';
import { logger } from '../lib/logger';

export function startShipmentNotificationRunner() {
  if (process.env.UDC_SHIPMENT_WHATSAPP_SEND_ENABLED !== 'true') return { enabled: false };
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { logger.info(await dispatchShipmentNotifications(), 'UDC notification outbox scan completed'); }
    catch { logger.warn({ reason: 'dispatch_unavailable' }, 'UDC notification outbox scan failed'); }
    finally { running = false; }
  };
  const interval = setInterval(() => { void run(); }, 30_000);
  interval.unref();
  void run();
  return { enabled: true, stop: () => clearInterval(interval) };
}
