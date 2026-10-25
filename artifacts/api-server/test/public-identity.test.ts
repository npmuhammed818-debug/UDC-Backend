import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { companyAnswer, publicWebsite, trustedGuidanceAnswer } from '../src/akif/udcHandbook.ts';
import { SUPPORT_EMAIL, POLICY_VERSION, policies } from '../src/privacy/policies.ts';
import { buildConsentNotice, consentVersion, TERMS_URL, PRIVACY_URL } from '../src/privacy/consentNotice.ts';
import { decideWhatsAppConsent } from '../src/privacy/whatsappConsent.ts';

test('customer identity answers and consent use the founder-specified website and support', () => {
  assert.equal(publicWebsite, 'https://updowncircle.site/');
  assert.equal(SUPPORT_EMAIL, 'udc@updowncircle.site');
  assert.ok(companyAnswer.includes(publicWebsite));
  assert.ok(trustedGuidanceAnswer('What is your website?')?.includes(publicWebsite));
  const notice = buildConsentNotice(SUPPORT_EMAIL);
  for (const value of [SUPPORT_EMAIL, TERMS_URL, PRIVACY_URL]) assert.ok(notice.includes(value));
  assert.ok(!/pages\.dev|npmuhammed818@gmail\.com/.test(notice + companyAnswer + JSON.stringify(policies)));
  assert.equal(decideWhatsAppConsent({ state: 'accepted', version: consentVersion(POLICY_VERSION) }, consentVersion(POLICY_VERSION)), 'continue');
  assert.equal(decideWhatsAppConsent({ state: 'accepted', version: POLICY_VERSION + '+consent-v2' }, consentVersion(POLICY_VERSION)), 'notice');
});
test('privacy help and complaint failures do not route users to a personal mailbox', async () => {
  const ui = await readFile(new URL('../../udc-app/src/components/privacy.tsx', import.meta.url), 'utf8');
  assert.ok(ui.includes('mailto:udc@updowncircle.site'));
  const webhook = await readFile(new URL('../src/routes/whatsappWebhook.ts', import.meta.url), 'utf8');
  assert.ok(webhook.includes('Please email ${SUPPORT_EMAIL}'));
  assert.ok(!/npmuhammed818@gmail\.com/.test(ui + webhook));
});
