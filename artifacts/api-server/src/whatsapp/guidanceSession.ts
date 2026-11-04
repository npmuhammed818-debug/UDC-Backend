// Session-key derivation shared by guidance memory and the document-list flag,
// kept in a tiny module so chat code does not import the model stack.
import { createHmac } from 'node:crypto';

export function guidanceKey(phone: string) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || secret.length < 16) throw new Error('guidance_memory_unavailable');
  return createHmac('sha256', secret).update('UDC_GUIDANCE_V1\0' + phone).digest('hex');
}
