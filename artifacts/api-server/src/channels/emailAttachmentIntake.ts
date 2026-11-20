import { createHmac, randomUUID } from "node:crypto";
import { safeEmailAttachment, type EmailEvidence } from "./emailPilot.ts";

/**
 * Email attachment intake (owner direction, 10 Nov): sellers/buyers may send
 * confidential documents straight to udc@updowncircle.site, the same way they
 * already do on WhatsApp. Files go DIRECTLY to the protected document store:
 * never into the relay queue, worker notes, chat, drafts or logs. Workers
 * only learn THAT documents arrived and were stored, never what is in them.
 */

type Attachment = EmailEvidence["attachments"][number];

/** Decoded content for one attachment, or null when the fixture carries no
 *  (or malformed) content. Declared byte count must match exactly. */
export function attachmentContent(a: Attachment): Buffer | null {
  const b64 = (a as { contentB64?: unknown }).contentB64;
  if (typeof b64 !== "string" || b64.length === 0 || b64.length > 28_000_000) return null;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(b64)) return null;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0 || bytes.length !== a.bytes) return null;
  return bytes;
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "document";
}

export type EmailAttachmentStorePorts = {
  upload(path: string, bytes: Buffer, contentType: string): Promise<unknown>;
  record(metadata: Record<string, unknown>): Promise<unknown>;
};

/** Real ports: the protected udc-documents bucket plus a metadata-only audit
 *  row (name/type/size/path only - content never touches the database).
 *  Imports stay lazy so tests never load the database layer. */
export const liveEmailAttachmentStore: EmailAttachmentStorePorts = {
  upload: async (path, bytes, contentType) => {
    const { uploadDocumentBytes } = await import("../supabase/storage.ts");
    return uploadDocumentBytes(path, bytes, contentType);
  },
  record: async (metadata) => {
    const { db, auditLogsTable } = await import("@workspace/db");
    await db.insert(auditLogsTable).values({ action: "email_attachment_intake", entityType: "email_intake", metadata });
  },
};

/** Store every attachment of one email. Fails closed: any unsafe or
 *  unstorable file rejects the whole batch so no partial state survives. */
export async function storeConfidentialEmailAttachments(
  input: { from: string; messageId: string; attachments: Attachment[]; synthetic: boolean },
  ports: EmailAttachmentStorePorts = liveEmailAttachmentStore,
): Promise<{ stored: number }> {
  const messageKey = createHmac("sha256", "udc-email-intake").update(input.messageId).digest("hex").slice(0, 24);
  const staged: Array<{ a: Attachment; bytes: Buffer }> = [];
  for (const a of input.attachments) {
    const bytes = attachmentContent(a);
    if (!bytes || !safeEmailAttachment(a)) throw new Error("unsafe_attachment_content");
    staged.push({ a, bytes });
  }
  let stored = 0;
  for (const { a, bytes } of staged) {
    const path = `email-intake/${messageKey}/${randomUUID()}-${safeFileName(a.name)}`;
    await ports.upload(path, bytes, a.type);
    await ports.record({
      from: input.from,
      messageHash: messageKey,
      name: a.name,
      type: a.type,
      bytes: a.bytes,
      path,
      state: "stored_private",
      synthetic: input.synthetic,
    });
    stored += 1;
  }
  return { stored };
}
