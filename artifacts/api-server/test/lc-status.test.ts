import test from 'node:test';
import assert from 'node:assert/strict';
import { lcStage, lcStatusReply, lcStatusText } from '../src/deals/lcStatus.ts';

test('LC stage maps deal status and confirmed instrument honestly', () => {
  assert.equal(lcStage('initiated', false), 'awaiting_lc');
  assert.equal(lcStage('initiated', true), 'lc_confirmed');
  assert.equal(lcStage('approved', true), 'lc_confirmed');
  assert.equal(lcStage('payment', true), 'payment_in_progress');
  assert.equal(lcStage('commission', true), 'payment_recorded');
  assert.equal(lcStage('completed', true), 'deal_completed');
});

test('status text is honest, ships nothing before confirmation, and carries no dates or amounts', () => {
  assert.match(lcStatusText('awaiting_lc'), /does not ship until it is confirmed/);
  for (const stage of ['awaiting_lc', 'lc_confirmed', 'payment_in_progress', 'payment_recorded', 'deal_completed'] as const) {
    const text = lcStatusReply('UDC-1', stage === 'awaiting_lc' ? 'initiated' : stage, stage !== 'awaiting_lc');
    assert.doesNotMatch(text, /\$|\b\d{4}\b|\bUSD\b|\b\d+\s*(?:day|week)/i, stage);
  }
  const reply = lcStatusReply('UDC-TEST-9', 'initiated', false);
  assert.match(reply, /^UDC-TEST-9: The letter of credit is not in place yet\./);
  assert.match(reply, /UDC confirms exact dates and amounts in this chat\./);
});
