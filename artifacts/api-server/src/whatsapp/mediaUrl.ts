// The media download URL comes from Meta's media-metadata response, and the
// download request carries the WhatsApp access token in its Authorization
// header. Before attaching that credential, require the URL to be https on a
// known Meta media host - a poisoned or redirected URL must never receive it.
const ALLOWED_MEDIA_HOSTS = new Set([
  "graph.facebook.com",
  "lookaside.fbsbx.com",
]);
const ALLOWED_MEDIA_SUFFIXES = [".fbsbx.com", ".fbcdn.net", ".whatsapp.net", ".facebook.com"];

export function isAllowedMediaDownloadUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_MEDIA_HOSTS.has(host)) return true;
  return ALLOWED_MEDIA_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
