// Bounded, redacted text for logs: connection strings, credentials and long
// token-like strings never reach the log line.
export function redactForLog(value: unknown, max = 200): string {
  return String(value ?? 'unknown')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, '[url]')
    .replace(/\b(password|passwd|pwd|secret|token|apikey|api_key|authorization|key)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, '[token]')
    .slice(0, max);
}
