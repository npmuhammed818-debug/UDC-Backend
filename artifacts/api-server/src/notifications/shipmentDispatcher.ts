import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import { POLICY_VERSION } from '../privacy/policies';
import { consentVersion } from '../privacy/consentNotice';
import { authorizeCustomerWindow } from '../whatsapp/customerServiceWindow';
import { sendWhatsAppNotification } from '../whatsapp/notificationTransport';
import { reconcileStoredShipmentReceipts } from '../whatsapp/shipmentDeliveryReceipts';
import { runShipmentWhatsAppOutbox } from './shipmentOutbox';
import { notificationText } from './deliveryContent';

export async function dispatchShipmentNotifications(options: {
  executor?: Pick<typeof db, 'execute'>; transport?: typeof fetch;
  env?: NodeJS.ProcessEnv; now?: Date;
} = {}) {
  const env = options.env ?? process.env, executor = options.executor ?? db;
  const now = options.now ?? new Date();
  const secret = env.WHATSAPP_APP_SECRET ?? '';
  if (env.UDC_SHIPMENT_WHATSAPP_SEND_ENABLED !== 'true' || !secret)
    return runShipmentWhatsAppOutbox({ enabled: false });
  async function consent(phone: string) {
    const fingerprint = createHmac('sha256', secret).update(phone).digest('hex');
    const result = await executor.execute(sql`
      SELECT metadata FROM public.audit_logs
      WHERE entity_type='whatsapp_consent' AND metadata->>'fingerprint'=${fingerprint}
      ORDER BY created_at DESC,id DESC LIMIT 1
    `);
    const meta = result.rows[0]?.metadata as Record<string, unknown> | undefined;
    return meta?.status === 'accepted' && meta.policyVersion === consentVersion(POLICY_VERSION);
  }
  const result = await runShipmentWhatsAppOutbox({
    executor, enabled: true, now, batchSize: 5,
    policyAuthorized: consent,
    send: async (phone, body, context) => {
      // Recheck identity, opt-in and membership immediately before external I/O;
      // the queue is never authority for the destination or audience.
      const eligible = await executor.execute(sql`
        SELECT u.id,u.role,n.type FROM public.users u
        JOIN public.notifications n ON n.id=(SELECT notification_id FROM public.whatsapp_shipment_outbox WHERE id=${context.jobId}) AND n.user_id=u.id
        JOIN public.deals d ON d.id=${context.dealId}
        JOIN public.notification_preferences p ON p.user_id=u.id
        WHERE u.id=${context.userId} AND u.phone=${phone} AND u.status='verified'
          AND p.optional_whatsapp=true AND p.reminders=true
          AND ((u.role='buyer' AND d.buyer_user_id=u.id)
            OR (u.role='seller' AND d.seller_user_id=u.id)
            OR (u.role='agent' AND EXISTS(SELECT 1 FROM public.deal_participants dp
              WHERE dp.deal_id=d.id AND dp.user_id=u.id AND dp.participant_role='agent' AND dp.status='active')))
      `);
      if (!eligible.rows.length || !await consent(phone)) return { delivered: false, reason: 'provider_rejected' };
      const audience=eligible.rows[0] as {role:string;type:string};
      const safeBody=notificationText(audience.type,audience.role);
      if(!safeBody)return {delivered:false,reason:'provider_rejected'};
      const freeForm = await authorizeCustomerWindow(phone, context.userId, context.dealId, { executor, now, secret });
      return sendWhatsAppNotification({ phone, body:safeBody, freeForm }, { env, transport: options.transport });
    },
  });
  // Early callbacks are journalled by the existing signed webhook and applied
  // only after the provider ID has been committed. No automatic resend of a
  // failed receipt or uncertain submission is allowed.
  await reconcileStoredShipmentReceipts({ executor, secret, now });
  return result;
}
