// src/auth/resendAuthProvider.ts
import { createHmac } from "node:crypto";
var RESEND_API = "https://api.resend.com/emails";
var MAX_RECEIPT_BYTES = 4096;
function senderAddress(from) {
  const parsed = /^(?:[A-Za-z0-9 .'-]{1,70} <)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63})>?$/.exec(from);
  return parsed?.[1]?.toLowerCase() ?? null;
}
function validateResendConfig(config) {
  const sender = senderAddress(config.from.trim()), domain = config.verifiedDomain.toLowerCase().trim();
  return Boolean(
    /^re_[A-Za-z0-9_-]{8,}$/.test(config.apiKey.trim()) && sender && /^[a-z0-9.-]{4,253}$/.test(domain) && sender.split("@")[1] === domain && domain !== "resend.dev" && config.idempotencySecret.length >= 32
  );
}
function resendTransportConfigured(env = process.env) {
  return env.UDC_AUTH_EMAIL_TRANSPORT === "resend" && env.UDC_AUTH_EMAIL_SEND_ENABLED === "true" && validateResendConfig({
    apiKey: env.RESEND_API_KEY ?? "",
    from: env.UDC_AUTH_EMAIL_FROM ?? "",
    verifiedDomain: env.UDC_AUTH_EMAIL_VERIFIED_DOMAIN ?? "",
    idempotencySecret: env.SESSION_SECRET ?? ""
  });
}
function makeAuthEmailText(message) {
  const descriptions = {
    verify_email: "verify your UDC email address",
    reset_password: "reset your UDC password",
    link_phone: "recover your UDC account on a new WhatsApp number"
  };
  if (!Object.hasOwn(descriptions, message.purpose) || !/^\d{6}$/.test(message.code) || !Number.isFinite(message.expiresAt.getTime()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) throw Error("invalid_auth_email");
  return `Your UDC verification code is: ${message.code}

Use this code to ${descriptions[message.purpose]}. The code expires in 10 minutes. Never share it with anyone.

If you did not request this, ignore the message. UDC will never ask for your code by phone or chat.`;
}
async function readBoundedReceipt(response) {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RECEIPT_BYTES) {
    await response.body?.cancel();
    throw Error("email_delivery_unavailable");
  }
  if (!response.body) throw Error("email_delivery_unavailable");
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RECEIPT_BYTES) {
        await reader.cancel();
        throw Error("email_delivery_unavailable");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(all);
}
function createResendAuthSender(config, transport = fetch) {
  if (!validateResendConfig(config)) throw Error("email_delivery_unavailable");
  return async (message, signal) => {
    if (signal.aborted || !validateResendConfig(config)) throw Error("email_delivery_unavailable");
    const text = makeAuthEmailText(message);
    const idempotencyKey = createHmac("sha256", config.idempotencySecret).update(JSON.stringify(["udc-auth-email-v1", message.to, message.code, message.purpose, message.expiresAt.toISOString()])).digest("hex");
    let response;
    try {
      response = await transport(RESEND_API, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${config.apiKey.trim()}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          from: config.from.trim(),
          to: [message.to],
          subject: message.purpose === "reset_password" ? "UDC password recovery code" : message.purpose === "link_phone" ? "UDC WhatsApp account recovery code" : "UDC email verification code",
          text
        }),
        signal,
        redirect: "error",
        referrerPolicy: "no-referrer"
      });
    } catch {
      throw Error("email_delivery_unavailable");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => void 0);
      throw Error("email_delivery_unavailable");
    }
    let payload;
    try {
      payload = JSON.parse(await readBoundedReceipt(response));
    } catch {
      throw Error("email_delivery_unavailable");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !/^[a-fA-F0-9-]{36}$/.test(String(payload.id ?? ""))) {
      throw Error("email_delivery_unavailable");
    }
  };
}

// src/auth/emailDelivery.ts
var sendAuthEmail = async (message, signal) => {
  if (!resendTransportConfigured()) throw new Error("email_delivery_unavailable");
  return createResendAuthSender({
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.UDC_AUTH_EMAIL_FROM ?? "",
    verifiedDomain: process.env.UDC_AUTH_EMAIL_VERIFIED_DOMAIN ?? "",
    idempotencySecret: process.env.SESSION_SECRET ?? ""
  })(message, signal);
};
export {
  createResendAuthSender,
  makeAuthEmailText,
  resendTransportConfigured,
  sendAuthEmail,
  validateResendConfig
};
