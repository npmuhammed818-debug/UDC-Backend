import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendWhatsAppNotification } from '../src/whatsapp/notificationTransport.ts';
import { notificationText, GENERIC_NOTIFICATION_TEMPLATE_BODY as templateBody } from '../src/notifications/deliveryContent.ts';

const env = {
  UDC_SHIPMENT_WHATSAPP_SEND_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'synthetic-not-a-token',
  WHATSAPP_PHONE_NUMBER_ID: '12345678', WHATSAPP_BUSINESS_ACCOUNT_ID: '23456789',
  UDC_SHIPMENT_WHATSAPP_TEMPLATE_NAME: 'udc_deal_update', UDC_SHIPMENT_WHATSAPP_TEMPLATE_LANGUAGE: 'en',
};
const input = { phone: '10000000001', body: notificationText('shipment_milestone', 'buyer')!, freeForm: true };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test('proactive notification transport is disabled by default with no provider calls', async () => {
  let calls = 0;
  const result = await sendWhatsAppNotification(input, { env: {}, transport: async () => { calls++; throw Error(); } });
  assert.equal(result.delivered, false); assert.equal(calls, 0);
});
test('notification content is allowlisted, role-aware and excludes arbitrary in-app information', () => {
  assert.equal(notificationText('bank_credentials', 'buyer'), null);
  assert.equal(notificationText('document_reviewed', 'agent'), null);
  assert.equal(notificationText('deal_status_updated', 'outsider'), null);
  assert.match(notificationText('shipment_eta_updated', 'seller')!, /estimate, not confirmation/);
  assert.match(notificationText('shipment_milestone', 'agent')!, /assigned UDC deal/);
});
test('inside the window sends plain text once through the fixed Meta messages endpoint', async () => {
  let calls = 0;
  const result = await sendWhatsAppNotification(input, { env, transport: async (url, init) => {
    calls++; assert.equal(String(url), 'https://graph.facebook.com/v21.0/12345678/messages');
    assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.type, 'text'); assert.equal(body.text.preview_url, false);
    return json({ messages: [{ id: 'wamid.synthetic' }] });
  } });
  assert.deepEqual(result, { delivered: true, messageId: 'wamid.synthetic' }); assert.equal(calls, 1);
});
test('outside the window requires an exact approved UTILITY template from the configured WABA', async () => {
  for (const variant of ['approved', 'paused', 'marketing', 'wrong-body', 'wrong-language', 'parameters', 'missing']) {
    let posts = 0;
    const result = await sendWhatsAppNotification({ ...input, freeForm: false }, { env, transport: async (url, init) => {
      if (init?.method === 'POST') {
        posts++; const body = JSON.parse(String(init.body));
        assert.equal(body.type, 'template'); assert.equal(body.template.name, 'udc_deal_update');
        assert.equal(body.text, undefined); assert.equal(body.template.components, undefined);
        return json({ messages: [{ id: 'wamid.template' }] });
      }
      assert.equal(new URL(String(url)).pathname, '/v21.0/23456789/message_templates');
      return json({ data: variant === 'missing' ? [] : [{
        name: env.UDC_SHIPMENT_WHATSAPP_TEMPLATE_NAME, language: variant === 'wrong-language' ? 'fr' : 'en',
        status: variant === 'paused' ? 'PAUSED' : 'APPROVED', category: variant === 'marketing' ? 'MARKETING' : 'UTILITY',
        components: [{ type: 'BODY', text: variant === 'wrong-body' ? 'private data' : templateBody },
          ...(variant === 'parameters' ? [{ type: 'HEADER', text: '{{1}}' }] : [])],
      }] });
    } });
    assert.equal(result.delivered, variant === 'approved'); assert.equal(posts, variant === 'approved' ? 1 : 0);
  }
});
test('confirmed rejections are bounded retries; timeouts, 5xx and invalid acknowledgements are ambiguous', async () => {
  for (const status of [400, 429]) {
    const result = await sendWhatsAppNotification(input, { env, transport: async () => json({ error: { code: 123 } }, status) });
    assert.deepEqual(result, { delivered: false, reason: status === 429 ? 'provider_rate_limited' : 'provider_rejected' });
  }
  await assert.rejects(sendWhatsAppNotification(input, { env, transport: async () => json({ error: { code: 123 } }, 503) }));
  await assert.rejects(sendWhatsAppNotification(input, { env, transport: async () => { throw Error('timeout'); } }));
  assert.deepEqual(await sendWhatsAppNotification(input, { env, transport: async () => json({}) }), { delivered: false, reason:'provider_outcome_unknown' });
  await assert.rejects(sendWhatsAppNotification(input, { env, transport: async () => new Response('x'.repeat(20_000)) }));
});
