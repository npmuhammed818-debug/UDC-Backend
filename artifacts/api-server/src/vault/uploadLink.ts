// Pure rules for the confidential document vault (no I/O).
// Confidential documents never travel over WhatsApp. AKIF sends a short-lived,
// single-use link; the user uploads straight to the private Supabase bucket.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const VAULT_LINK_TTL_MS = 15 * 60_000;
export const VAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const VAULT_DOCUMENT_TYPES = [
  "passport",
  "national_id",
  "bank_statement",
  "company_registration",
  "business_license",
  "tax_certificate",
  "commercial_agreement",
  "other",
  // Role checklist keys (Upload documents flow): the link carries the same key
  // the status list matches on, so an upload updates the list directly.
  "tax_id",
  "import_licence",
  "export_licence",
  "product_licence",
  "past_exports",
] as const;
// One link covering several documents: "multi:<key>,<key>" with checklist keys.
export const MULTI_DOCUMENT_PREFIX = "multi:";
export function parseMultiDocumentType(value: unknown): string[] | null {
  if (typeof value !== "string" || !value.startsWith(MULTI_DOCUMENT_PREFIX)) return null;
  const keys = value.slice(MULTI_DOCUMENT_PREFIX.length).split(",").filter(Boolean);
  return keys.length && keys.every((k) => (VAULT_DOCUMENT_TYPES as readonly string[]).includes(k)) ? keys : null;
}
export type VaultDocumentType = (typeof VAULT_DOCUMENT_TYPES)[number];

export function isVaultDocumentType(value: unknown): value is VaultDocumentType {
  return typeof value === "string" && (VAULT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function hashLinkToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueUploadLinkToken(now: Date = new Date()) {
  // 128 bits, unguessable; short enough that the link reads clean on a phone.
  const token = randomBytes(16).toString("base64url");
  return { token, tokenHash: hashLinkToken(token), expiresAt: new Date(now.getTime() + VAULT_LINK_TTL_MS) };
}

export type LinkRecord = {
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};
export type LinkCheck = { ok: true } | { ok: false; reason: "invalid" | "expired" | "used" | "revoked" };

export function checkUploadLink(record: LinkRecord | null | undefined, presentedToken: unknown, now: Date = new Date()): LinkCheck {
  if (!record || typeof presentedToken !== "string" || presentedToken.length < 20 || presentedToken.length > 200) {
    return { ok: false, reason: "invalid" };
  }
  const a = Buffer.from(hashLinkToken(presentedToken), "hex");
  const b = Buffer.from(record.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  if (record.revokedAt) return { ok: false, reason: "revoked" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true };
}

export type FileKind = { extension: "pdf" | "png" | "jpg"; contentType: "application/pdf" | "image/png" | "image/jpeg" };

// Trust the bytes, never the declared content type or filename.
export function sniffUpload(bytes: unknown): FileKind | null {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > VAULT_MAX_UPLOAD_BYTES) return null;
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return { extension: "pdf", contentType: "application/pdf" };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", contentType: "image/jpeg" };
  return null;
}

// Matches managedCompanyDocumentPath(): companies/<companyId>/<segment>.
export function vaultObjectPath(companyId: string, objectId: string, kind: FileKind) {
  return `companies/${companyId}/vault-${objectId}.${kind.extension}`;
}

// What AKIF and ordinary users may learn about a document: an outcome only.
export type PublicDocumentStatus = "pending" | "verified" | "rejected" | "unverified";
export function publicDocumentStatus(dbStatus: string | null | undefined): PublicDocumentStatus {
  if (dbStatus === "approved") return "verified";
  if (dbStatus === "rejected") return "rejected";
  if (dbStatus === "pending") return "pending";
  return "unverified";
}

export function vaultPublicOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function uploadPageUrl(baseUrl: string, token: string) {
  const base = vaultPublicOrigin(baseUrl);
  if (!base) throw Error('invalid_vault_public_origin');
  return `${base}/u/${encodeURIComponent(token)}`;
}

// WhatsApp reply when someone sends, or asks to send, a confidential document.
export function vaultRedirectReply(link?: { url: string; expiresAt: Date }) {
  const intro =
    "Please don't send passports, IDs, bank statements or company records on WhatsApp - chats aren't a safe place for them.";
  if (!link) {
    return `${intro} Tell me which document you need to submit and I'll send you a secure private upload link that works for 15 minutes.`;
  }
  return `${intro} Use this private upload link instead (single use, expires in 15 minutes):\n${link.url}\nOnly UDC's verification team can open what you upload. I only get the result, never the document.`;
}

const CONFIDENTIAL_WORDS = /\b(passport|national id|emirates id|id card|bank statement|bank letter|account statement|kyc|trade licen[cs]e|company registration|incorporation certificate|tax certificate|spa signed|signed agreement)\b/i;
export function looksLikeConfidentialDocumentTopic(text: string | null | undefined) {
  return typeof text === "string" && CONFIDENTIAL_WORDS.test(text);
}

// Owner decision: ordinary deal files and unlabelled images are still accepted in a deal
// thread, but every such upload gets this warning so sensitive files go through the vault.
export const SENSITIVE_UPLOAD_WARNING =
  "Please don't send sensitive documents or images (passports, IDs, bank statements, company records) directly on WhatsApp. For those, send Menu, then Documents, to get a secure private upload link.";
