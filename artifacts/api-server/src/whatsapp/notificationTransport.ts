import {parseMessageAcknowledgement,readMetaJson} from './messageAcknowledgement.ts';
import { getWhatsAppConfig } from './client.ts';
import { GENERIC_NOTIFICATION_TEMPLATE_BODY } from '../notifications/deliveryContent.ts';

export type NotificationTransportResult =
  | { delivered: true; messageId: string }
  | { delivered: false; reason: 'not_configured' | 'preflight_unavailable' | 'provider_rejected' | 'provider_rate_limited' | 'provider_outcome_unknown' };

// Uses the existing Meta integration's server credentials, API version and
// messages endpoint. Unlike conversational replies, proactive sends must be
// separately activated and must carry current window/template authorization.
export async function sendWhatsAppNotification(input: {
  phone: string; body: string; freeForm: boolean;
}, options: { transport?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<NotificationTransportResult> {
  const env = options.env ?? process.env, transport = options.transport ?? fetch;
  if (env.UDC_SHIPMENT_WHATSAPP_SEND_ENABLED !== 'true') return { delivered: false, reason: 'not_configured' };
  const config=getWhatsAppConfig(env);
  const token=config?.accessToken, sender=config?.phoneNumberId;
  if (!token || !/^\d{5,30}$/.test(sender ?? '') || !/^\d{7,20}$/.test(input.phone))
    return { delivered: false, reason: 'not_configured' };
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let message: object = { type: 'text', text: { body: input.body, preview_url: false } };
  if (!input.freeForm) {
    const name = env.UDC_SHIPMENT_WHATSAPP_TEMPLATE_NAME ?? '';
    const language = env.UDC_SHIPMENT_WHATSAPP_TEMPLATE_LANGUAGE ?? '';
    const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
    if (!/^[a-z0-9_]{1,90}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language) || !/^\d{5,30}$/.test(waba))
      return { delivered: false, reason: 'not_configured' };
    const url = new URL(`https://graph.facebook.com/v21.0/${waba}/message_templates`);
    url.searchParams.set('name', name);
    url.searchParams.set('fields', 'name,language,status,category,components');
    url.searchParams.set('limit', '50');
    try {
      const response = await transport(url, { headers, signal: AbortSignal.timeout(5_000), redirect: 'error' });
      if (!response.ok) { await response.body?.cancel(); return { delivered: false, reason: 'preflight_unavailable' }; }
      const data = await readMetaJson(response, 96 * 1024);
      const template = Array.isArray(data?.data) && data.data.find((t: any) => t.name === name && t.language === language);
      if (!template || template.status !== 'APPROVED' || template.category !== 'UTILITY' ||
        !Array.isArray(template.components) || template.components.length !== 1 ||
        template.components[0].type !== 'BODY' || template.components[0].text !== GENERIC_NOTIFICATION_TEMPLATE_BODY)
        return { delivered: false, reason: 'provider_rejected' };
    } catch { return { delivered: false, reason: 'preflight_unavailable' }; }
    message = { type: 'template', template: { name, language: { code: language } } };
  }
  // No retries here. A timeout, 5xx or malformed acceptance is ambiguous; the
  // durable outbox must quarantine it rather than risk a duplicate send.
  const response = await transport(`https://graph.facebook.com/v21.0/${sender}/messages`, {
    method: 'POST', headers, signal: AbortSignal.timeout(10_000), redirect: 'error',
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: input.phone, ...message }),
  });
  const payload = await readMetaJson(response);
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && typeof payload?.error?.code === 'number')
      return { delivered: false, reason: response.status === 429 ? 'provider_rate_limited' : 'provider_rejected' };
    throw Error('meta_outcome_unknown');
  }
  return parseMessageAcknowledgement(payload);
}
