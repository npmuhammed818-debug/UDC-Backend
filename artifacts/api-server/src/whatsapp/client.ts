import {readMessageAcknowledgement} from './messageAcknowledgement.ts';
type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
};

export function getWhatsAppConfig(env:NodeJS.ProcessEnv=process.env): WhatsAppConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

const getConfig=getWhatsAppConfig;
const unknownSubmission=()=>({delivered:false as const,reason:'provider_outcome_unknown' as const});
async function maybeSubmitted(request:Promise<Response>):Promise<Response|null>{
  try{const response=await request;if(response.status>=500){await response.body?.cancel();return null;}return response;}
  catch{return null;}
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

  const response = await maybeSubmitted(fetch(
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
  ));

  if(!response)return unknownSubmission();
  if (!response.ok) {
    const error = await providerError(response);
    throw new Error(`whatsapp_delivery_failed http=${error.httpStatus} code=${error.code ?? "unknown"} subcode=${error.subcode ?? "none"}`);
  }

  return readMessageAcknowledgement(response);
}

export type WhatsAppInteractive =
  | { type: 'button'; body: { text: string }; action: { buttons: Array<{type:'reply';reply:{id:string;title:string}}> } }
  | { type: 'list'; body: { text: string }; action: { button: string; sections: Array<{title:string;rows:Array<{id:string;title:string;description?:string}>}> } }
  | { type: 'flow'; body: { text: string }; action: { name:'flow'; parameters: Record<string,unknown> } };

export async function sendWhatsAppInteractive(to: string, interactive: WhatsAppInteractive) {
  if (interactive.body.text.length > 1024) throw new Error('interactive_body_too_long');
  if (interactive.type === 'button' && (interactive.action.buttons.length < 1 || interactive.action.buttons.length > 3 || interactive.action.buttons.some(b=>b.reply.title.length>20))) throw new Error('interactive_buttons_invalid');
  if (interactive.type === 'list' && (interactive.action.button.length>20 || interactive.action.sections.flatMap(s=>s.rows).length>10 || interactive.action.sections.some(s=>s.rows.some(r=>r.title.length>24 || (r.description?.length??0)>72)))) throw new Error('interactive_list_invalid');
  const config=getConfig();
  if(!config)return {delivered:false as const,reason:'not_configured' as const};
  const response=await maybeSubmitted(fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,{method:'POST',signal:AbortSignal.timeout(10_000),headers:{authorization:`Bearer ${config.accessToken}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'interactive',interactive})}));
  if(!response)return unknownSubmission();
  if(!response.ok){const error=await providerError(response);throw new Error(`whatsapp_interactive_failed http=${error.httpStatus} code=${error.code??'unknown'}`);}
  return readMessageAcknowledgement(response);
}

// Retain the helper for existing callers, but do not append a menu button to
// every reply. The role menu is available from the explicit Menu entry point.
export async function sendWhatsAppTextWithMenu(to: string, body: string) {
  return sendWhatsAppText(to, body);
}

export async function sendWhatsAppDocument(
  to: string,
  link: string,
  filename: string,
  caption?: string,
) {
  const config = getConfig();
  if (!config) return { delivered: false as const, reason: "not_configured" as const };

  const response = await maybeSubmitted(fetch(
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
        type: "document",
        document: {
          link,
          filename,
          ...(caption ? { caption } : {}),
        },
      }),
    },
  ));

  if(!response)return unknownSubmission();
  if (!response.ok) {
    const error = await providerError(response);
    throw new Error(`whatsapp_document_delivery_failed http=${error.httpStatus} code=${error.code ?? "unknown"} subcode=${error.subcode ?? "none"}`);
  }

  return readMessageAcknowledgement(response);
}

export async function downloadWhatsAppMedia(mediaId: string) {
  const config = getConfig();
  if (!config) throw new Error("whatsapp_not_configured");

  const metaResponse = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`,
    {
      headers: { authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!metaResponse.ok) {
    const error = await providerError(metaResponse);
    throw new Error(`whatsapp_media_lookup_failed http=${error.httpStatus} code=${error.code ?? "unknown"}`);
  }

  const metadata = await metaResponse.json() as {
    url?: unknown;
    mime_type?: unknown;
    file_size?: unknown;
  };
  if (typeof metadata.url !== "string") {
    throw new Error("whatsapp_media_url_missing");
  }

  const maximumBytes = 25 * 1024 * 1024;
  if (typeof metadata.file_size === "number" && metadata.file_size > maximumBytes) {
    throw new Error("whatsapp_media_too_large");
  }
  const fileResponse = await fetch(metadata.url, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!fileResponse.ok) {
    throw new Error(`whatsapp_media_download_failed http=${fileResponse.status}`);
  }

  if (Number(fileResponse.headers.get("content-length")) > maximumBytes) {
    await fileResponse.body?.cancel();
    throw new Error("whatsapp_media_too_large");
  }
  const reader = fileResponse.body?.getReader();
  if (!reader) throw new Error("whatsapp_media_empty");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximumBytes) { await reader.cancel(); throw new Error("whatsapp_media_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const mimeType = typeof metadata.mime_type === "string"
    ? metadata.mime_type
    : fileResponse.headers.get("content-type") ?? "application/octet-stream";

  return {
    bytes,
    mimeType,
    fileSize: typeof metadata.file_size === "number" ? metadata.file_size : bytes.byteLength,
  };
}

/** Emoji reaction on an inbound message (Cloud API `reaction` type). Best effort. */
export async function sendWhatsAppReaction(to: string, inboundMessageId: string, emoji: string) {
  const config = getConfig();
  if (!config) return { delivered: false as const, reason: "not_configured" as const };
  const response = await maybeSubmitted(fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "reaction", reaction: { message_id: inboundMessageId, emoji } }),
  }));
  if(!response)return unknownSubmission();
  if(!response.ok){await response.body?.cancel();return {delivered:false as const,reason:'provider_rejected' as const};}
  return readMessageAcknowledgement(response);
}

/** Uploads OGG/Opus bytes and sends them as a WhatsApp voice message. */
export async function sendWhatsAppVoiceNote(to: string, ogg: Uint8Array) {
  const config = getConfig();
  if (!config) return { delivered: false as const, reason: "not_configured" as const };
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", "audio/ogg");
  const copy = new Uint8Array(ogg.length); copy.set(ogg);
  form.set("file", new Blob([copy.buffer], { type: "audio/ogg" }), "reply.ogg");
  const up = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/media`, {
    method: "POST", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${config.accessToken}` }, body: form,
  });
  if (!up.ok) { await up.body?.cancel(); return { delivered: false as const, reason: "upload_failed" as const }; }
  const mediaId = ((await up.json().catch(() => null)) as { id?: unknown } | null)?.id;
  if (typeof mediaId !== "string") return { delivered: false as const, reason: "upload_failed" as const };
  const sent = await maybeSubmitted(fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "audio", audio: { id: mediaId } }),
  }));
  if(!sent)return unknownSubmission();
  if(!sent.ok){await sent.body?.cancel();return {delivered:false as const,reason:'send_failed' as const};}
  return readMessageAcknowledgement(sent);
}
