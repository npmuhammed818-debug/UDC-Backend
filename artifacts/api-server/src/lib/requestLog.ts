// Vault paths contain bearer credentials. Removing query strings alone does
// not protect those credentials from request logs.
export function safeRequestLogPath(url: string | undefined) {
  return url?.split(/[?#]/, 1)[0]?.replace(
    /^(\/api\/vault\/upload\/|\/api\/document-review\/|\/u\/).+/i,
    '$1[redacted]',
  );
}
