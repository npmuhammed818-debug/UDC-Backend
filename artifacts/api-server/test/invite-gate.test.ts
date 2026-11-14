import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteOnlyOn, isAllowedPhone, HOLDING_REPLY } from '../src/whatsapp/inviteRules.ts';
test('invite gate flags and allowlist', () => {
  assert.equal(inviteOnlyOn({ UDC_INVITE_ONLY: 'on' } as any), true);
  assert.equal(inviteOnlyOn({} as any), false);
  assert.equal(isAllowedPhone('+91 79941 33604', { UDC_ALLOWED_PHONES: '917994133604' } as any), true);
  assert.equal(isAllowedPhone('359888804562', { UDC_ALLOWED_PHONES: '917994133604' } as any), false);
  assert.doesNotMatch(HOLDING_REPLY, /[-\u2013\u2014]/);
});
