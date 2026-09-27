type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
};

function getConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

// Keep provider error messages, tokens, phone numbers and response bodies out of logs.
async function providerError(response: Response) {
  const payload = await response.json().catch(() => null) as {
    error?: { code?: unknown; error_subcode?: unknown };
  } | null;
  const code = typeof payload?.error?.code === "number" ? payload.error.code : undefined;
  const subcode = typeof payload?.error?.error_subcode === "number" ? payload.error.error_subcode : undefined;
  return { httpStatus: response.status, code, subcode };
}

export async function checkWhatsAppConnection() {
  const config = getConfig();
  if (!config) return { ok: false, reason: "not_configured" };
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}?fields=id`,
      { headers: { authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return { ok: false, reason: "meta_rejected_credentials_or_phone", ...await providerError(response) };
    // A successful read validates access, not message delivery or recipient eligibility.
    await response.body?.cancel();
    return { ok: true, scope: "phone_number_access_only" };
  } catch {
    return { ok: false, reason: "meta_unreachable_or_timeout" };
  }
}

export async function ensureWhatsAppWebhookSubscription() {
  const config = getConfig();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!config) return { ok: false, reason: "not_configured" };
  if (!businessAccountId) return { ok: false, reason: "waba_not_configured" };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(businessAccountId)}/subscribed_apps`,
      {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return { ok: false, reason: "meta_waba_subscription_failed", ...await providerError(response) };
    }

    await response.body?.cancel();
    return { ok: true, scope: "waba_subscribed_apps" };
  } catch {
    return { ok: false, reason: "meta_unreachable_or_timeout" };
  }
}

export async function sendWhatsAppText(to: string, body: string) {
  const config = getConfig();
  if (!config) return { delivered: false as const, reason: "not_configured" as const };

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const error = await providerError(response);
    throw new Error(`whatsapp_delivery_failed http=${error.httpStatus} code=${error.code ?? "unknown"} subcode=${error.subcode ?? "none"}`);
  }

  const payload = await response.json().catch(() => null) as {
    messages?: Array<{ id?: unknown }>;
  } | null;
  const rawMessageId = payload?.messages?.[0]?.id;
  const messageId = typeof rawMessageId === "string" ? rawMessageId : undefined;

  return { delivered: true as const, messageId };
}
