import { createHmac } from 'node:crypto';

// Both normal registration and operator-approved test resets must use the
// exact same phone fingerprint. A second implementation can silently retain
// an old in-progress WhatsApp form after a reset.
export function guidedChatPhoneHash(phone: string): string {
  const key = process.env.WHATSAPP_APP_SECRET;
  if (!key || key.length < 16) throw new Error('chat_draft_signing_unavailable');
  return createHmac('sha256', key)
    .update('UDC_GUIDED_CHAT_V1\0' + phone)
    .digest('hex');
}
