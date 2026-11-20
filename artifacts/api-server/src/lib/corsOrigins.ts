// Cross-origin browser access is off by default. Same-origin requests and
// server-to-server calls (Meta webhooks, workers) carry no Origin header and
// are always allowed; browser origins must be listed in CORS_ALLOWED_ORIGINS.
// Pure logic lives here so it can be tested without loading the database layer.
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsOriginAllowed(
  origin: string | undefined,
  allowed: string[],
): boolean {
  if (!origin) return true; // same-origin or non-browser client
  return allowed.includes(origin);
}
