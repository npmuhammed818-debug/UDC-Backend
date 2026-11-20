// src/whatsapp/templateReadiness.ts
var MAX_BYTES = 96 * 1024;
function safeCode(value, max) {
  return typeof value === "string" ? value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, max) : "";
}
function whatsappTemplateConfigStatus() {
  return {
    configured: Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() && process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    enabledForSending: false,
    safeToSendProactively: false
  };
}
async function readWhatsAppTemplateReadiness(options = {}) {
  const waba = options.wabaId ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "";
  const token = options.token ?? process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  if (!/^\d{5,30}$/.test(waba) || !token) {
    return {
      configured: false,
      ok: false,
      reason: "meta_template_credentials_missing",
      productionReady: false
    };
  }
  const url = new URL(`https://graph.facebook.com/v21.0/${waba}/message_templates`);
  url.searchParams.set("fields", "name,language,category,status");
  url.searchParams.set("limit", "50");
  try {
    const response = await (options.transport ?? fetch)(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(1e4),
      redirect: "error"
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { configured: true, ok: false, reason: response.status === 401 || response.status === 403 ? "meta_template_access_denied" : response.status === 429 ? "meta_template_rate_limited" : "meta_template_request_failed", productionReady: false };
    }
    if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) {
      await response.body?.cancel();
      return { configured: true, ok: false, reason: "meta_template_response_too_large", productionReady: false };
    }
    const reader = response.body?.getReader();
    if (!reader) return { configured: true, ok: false, reason: "meta_template_invalid_response", productionReady: false };
    let n = 0, chunks = [];
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        n += value.length;
        if (n > MAX_BYTES) {
          await reader.cancel();
          return {
            configured: true,
            ok: false,
            reason: "meta_template_response_too_large",
            productionReady: false
          };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(n);
    let pos = 0;
    for (const c of chunks) {
      bytes.set(c, pos);
      pos += c.length;
    }
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { configured: true, ok: false, reason: "meta_template_invalid_response", productionReady: false };
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.data)) {
      return { configured: true, ok: false, reason: "meta_template_invalid_response", productionReady: false };
    }
    const result = data;
    const templates = result.data.slice(0, 50).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const t = item, name = safeCode(t.name, 90), language = safeCode(t.language, 12);
      if (!name || !language) return [];
      const status = ["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"].includes(String(t.status)) ? t.status : "UNKNOWN";
      const category = ["UTILITY", "AUTHENTICATION", "MARKETING"].includes(String(t.category)) ? String(t.category) : "OTHER";
      return [{ name, language, status, category }];
    });
    const approvedUtility = templates.filter((t) => t.status === "APPROVED" && t.category === "UTILITY").length;
    return {
      configured: true,
      ok: true,
      mode: "read_only",
      source: "meta_graph",
      productionReady: false,
      canSend: false,
      sampled: templates.length,
      incomplete: result.data.length > 50 || typeof result.paging?.next === "string",
      approvedUtility,
      templates,
      notice: "Template status alone does not authorize live messaging. Recipient opt-in, correct message purpose and current approval still require checks."
    };
  } catch {
    return { configured: true, ok: false, reason: "meta_template_connection_failed", productionReady: false };
  }
}
export {
  readWhatsAppTemplateReadiness,
  whatsappTemplateConfigStatus
};
