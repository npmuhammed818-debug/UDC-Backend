type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
};

function getConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

export async function sendWhatsAppText(to: string, body: string) {
  const config = getConfig();
  if (!config) return { delivered: false as const, reason: "not_configured" as const };

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
    {
      method: "POST",
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

  if (!response.ok) throw new Error("whatsapp_delivery_failed");
  return { delivered: true as const };
}
