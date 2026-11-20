import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  auditLogsTable, companiesTable, companyVerificationDocumentsTable, db,
  vaultAccessLogTable, vaultDeletionRequestsTable, vaultUploadLinksTable,
} from "@workspace/db";
import { uploadDocumentBytes } from "../supabase/storage";
import {
  checkUploadLink, hashLinkToken, issueUploadLinkToken, isVaultDocumentType, parseMultiDocumentType,
  vaultPublicOrigin, publicDocumentStatus, sniffUpload, uploadPageUrl, vaultObjectPath,
} from "./uploadLink";

const NO_VAULT_ROLES = new Set(["agent"]);
const MAX_ACTIVE_LINKS_PER_USER = 5;

export async function logVaultAccess(actorUserId: string | null, actorRole: string, action: string, documentId: string | null) {
  await db.insert(vaultAccessLogTable).values({ actorUserId, actorRole, action, documentId });
}

async function companyOf(userId: string) {
  const [company] = await db.select({ id: companiesTable.id }).from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId)).limit(1);
  return company;
}

export type CreateLinkResult =
  | { ok: true; url: string; expiresAt: Date }
  | { ok: false; error: "role_not_allowed" | "company_required" | "too_many_active_links" | "vault_base_url_not_configured" | "invalid_document_type" };

// Used by the authenticated API and, later, by AKIF for the signed-in WhatsApp user.
export async function createVaultUploadLink(user: { id: string; role: string }, documentType: string): Promise<CreateLinkResult> {
  if (NO_VAULT_ROLES.has(user.role)) return { ok: false, error: "role_not_allowed" };
  if (!isVaultDocumentType(documentType) && !parseMultiDocumentType(documentType)) return { ok: false, error: "invalid_document_type" };
  const base = process.env["VAULT_PUBLIC_BASE_URL"];
  if (!base || !vaultPublicOrigin(base)) return { ok: false, error: "vault_base_url_not_configured" };
  const company = await companyOf(user.id);
  if (!company) return { ok: false, error: "company_required" };
  const active = await db.select({ id: vaultUploadLinksTable.id }).from(vaultUploadLinksTable).where(and(
    eq(vaultUploadLinksTable.userId, user.id), isNull(vaultUploadLinksTable.usedAt),
    isNull(vaultUploadLinksTable.revokedAt), gt(vaultUploadLinksTable.expiresAt, new Date())));
  if (active.length >= MAX_ACTIVE_LINKS_PER_USER) return { ok: false, error: "too_many_active_links" };
  const issued = issueUploadLinkToken();
  await db.insert(vaultUploadLinksTable).values({
    tokenHash: issued.tokenHash, userId: user.id, companyId: company.id, documentType, expiresAt: issued.expiresAt,
  });
  await logVaultAccess(user.id, user.role, "upload_link_issued", null);
  return { ok: true, url: uploadPageUrl(base, issued.token), expiresAt: issued.expiresAt };
}

export async function lookupLink(token: string) {
  const [row] = await db.select().from(vaultUploadLinksTable)
    .where(eq(vaultUploadLinksTable.tokenHash, hashLinkToken(token))).limit(1);
  const check = checkUploadLink(row, token);
  return { row, check };
}

export type UploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: "invalid" | "expired" | "used" | "revoked" | "unsupported_file" | "upload_failed" | "already_uploaded" };

export async function acceptUpload(token: string, bytes: unknown, documentKey?: string): Promise<UploadResult> {
  const { row, check } = await lookupLink(token);
  if (!check.ok) return { ok: false, error: check.reason };
  const kind = sniffUpload(bytes);
  if (!kind) return { ok: false, error: "unsupported_file" };
  const multiKeys = parseMultiDocumentType(row!.documentType);
  // A multi link stays open until every expected document has arrived (or it
  // expires); each upload names its document with ?doc=<key>.
  if (multiKeys) {
    const key = typeof documentKey === "string" ? documentKey : "";
    if (!multiKeys.includes(key)) return { ok: false, error: "invalid" };
    const already = await db.select({ id: companyVerificationDocumentsTable.id }).from(companyVerificationDocumentsTable)
      .where(and(eq(companyVerificationDocumentsTable.companyId, row!.companyId),
        eq(companyVerificationDocumentsTable.documentType, key),
        gt(companyVerificationDocumentsTable.createdAt, row!.createdAt))).limit(1);
    if (already.length) return { ok: false, error: "already_uploaded" };
    return storeUpload(row!, key, kind, bytes, {
      onSuccess: async () => {
        const uploaded = await db.select({ documentType: companyVerificationDocumentsTable.documentType })
          .from(companyVerificationDocumentsTable)
          .where(and(eq(companyVerificationDocumentsTable.companyId, row!.companyId),
            gt(companyVerificationDocumentsTable.createdAt, row!.createdAt)));
        const uploadedTypes = new Set(uploaded.map((d) => d.documentType));
        if (multiKeys.every((k) => uploadedTypes.has(k))) {
          await db.update(vaultUploadLinksTable).set({ usedAt: new Date() }).where(eq(vaultUploadLinksTable.id, row!.id));
        }
      },
    });
  }
  // Atomic single-use claim: only one concurrent request can win.
  const claimed = await db.update(vaultUploadLinksTable).set({ usedAt: new Date() }).where(and(
    eq(vaultUploadLinksTable.id, row!.id), isNull(vaultUploadLinksTable.usedAt),
    isNull(vaultUploadLinksTable.revokedAt), gt(vaultUploadLinksTable.expiresAt, new Date()))).returning({ id: vaultUploadLinksTable.id });
  if (claimed.length !== 1) return { ok: false, error: "used" };
  return storeUpload(row!, row!.documentType, kind, bytes, {
    onFailure: async () => {
      // Release the link so the user can retry within the original window.
      await db.update(vaultUploadLinksTable).set({ usedAt: null }).where(eq(vaultUploadLinksTable.id, row!.id));
    },
  });
}

type VaultLinkRow = NonNullable<Awaited<ReturnType<typeof lookupLink>>["row"]>;
type SniffedKind = NonNullable<ReturnType<typeof sniffUpload>>;

async function storeUpload(
  row: VaultLinkRow, documentType: string, kind: SniffedKind, bytes: unknown,
  hooks: { onSuccess?: () => Promise<void>; onFailure?: () => Promise<void> } = {},
): Promise<UploadResult> {
  try {
    const fileUrl = await uploadDocumentBytes(vaultObjectPath(row.companyId, randomUUID(), kind), bytes as Buffer, kind.contentType);
    const [doc] = await db.insert(companyVerificationDocumentsTable).values({
      companyId: row.companyId, uploadedBy: row.userId, documentType, fileUrl, status: "pending",
    }).returning({ id: companyVerificationDocumentsTable.id });
    await logVaultAccess(row.userId, "owner", "document_uploaded", doc.id);
    await db.insert(auditLogsTable).values({ actorUserId: row.userId, action: "vault_document_uploaded",
      entityType: "company_verification_document", entityId: doc.id, metadata: { documentType } });
    await hooks.onSuccess?.();
    return { ok: true, documentId: doc.id };
  } catch {
    await hooks.onFailure?.();
    return { ok: false, error: "upload_failed" };
  }
}

// Owner view: status only. No file URLs, no review notes beyond the outcome.
export async function listOwnDocumentStatuses(user: { id: string; role: string }) {
  const company = await companyOf(user.id);
  if (!company) return [];
  const rows = await db.select({
    id: companyVerificationDocumentsTable.id, documentType: companyVerificationDocumentsTable.documentType,
    status: companyVerificationDocumentsTable.status, createdAt: companyVerificationDocumentsTable.createdAt,
  }).from(companyVerificationDocumentsTable)
    .where(eq(companyVerificationDocumentsTable.companyId, company.id)).orderBy(desc(companyVerificationDocumentsTable.createdAt));
  await logVaultAccess(user.id, user.role, "status_listed", null);
  return rows.map((r) => ({ id: r.id, documentType: r.documentType, status: publicDocumentStatus(r.status), createdAt: r.createdAt }));
}

export async function requestDocumentDeletion(user: { id: string; role: string }, documentId: string) {
  const company = await companyOf(user.id);
  if (!company) return { ok: false as const, error: "not_found" as const };
  const [doc] = await db.select({ id: companyVerificationDocumentsTable.id }).from(companyVerificationDocumentsTable)
    .where(and(eq(companyVerificationDocumentsTable.id, documentId), eq(companyVerificationDocumentsTable.companyId, company.id))).limit(1);
  if (!doc) return { ok: false as const, error: "not_found" as const };
  const [open] = await db.select({ id: vaultDeletionRequestsTable.id }).from(vaultDeletionRequestsTable)
    .where(and(eq(vaultDeletionRequestsTable.documentId, documentId), eq(vaultDeletionRequestsTable.status, "requested"))).limit(1);
  if (!open) await db.insert(vaultDeletionRequestsTable).values({ documentId, requestedBy: user.id });
  await logVaultAccess(user.id, user.role, "deletion_requested", documentId);
  return { ok: true as const };
}
