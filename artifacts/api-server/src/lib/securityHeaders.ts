// Fixed response headers for every route: stop MIME sniffing, framing,
// referrer leakage, and downgrade attacks. No CSP here - the SPA and the
// vault upload page use inline script/style, so a strict CSP needs a per-page
// design, not a global one. These four are safe for every response we send.
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};
