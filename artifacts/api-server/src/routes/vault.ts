import { Router, raw, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../auth/middleware";
import { VAULT_DOCUMENT_TYPES, VAULT_MAX_UPLOAD_BYTES } from "../vault/uploadLink";
import { acceptUpload, createVaultUploadLink, listOwnDocumentStatuses, lookupLink, requestDocumentDeletion } from "../vault/service";
import { uploadPageHtml } from "../vault/uploadPage";
import { setVaultLinkIssuer } from "../vault/issuer";

setVaultLinkIssuer(createVaultUploadLink);

const router: IRouter = Router();
const noStore = (res: import("express").Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
};

router.post("/vault/upload-links", requireAuth, async (req, res) => {
  noStore(res);
  const parsed = z.object({ documentType: z.enum(VAULT_DOCUMENT_TYPES) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_document_type" }); return; }
  try {
    const result = await createVaultUploadLink({ id: req.authUser!.id, role: req.authUser!.role }, parsed.data.documentType);
    if (!result.ok) { res.status(result.error === "role_not_allowed" ? 403 : result.error === "too_many_active_links" ? 429 : result.error === "company_required" ? 409 : 503).json({ error: result.error }); return; }
    res.status(201).json({ url: result.url, expiresAt: result.expiresAt });
  } catch { res.status(500).json({ error: "vault_link_failed" }); }
});

// Public bearer page: the unguessable single-use token is the credential.
router.get("/vault/upload/:token", async (req, res) => {
  noStore(res);
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const { row, check } = await lookupLink(String(req.params["token"] ?? ""));
    res.status(check.ok ? 200 : 410).type("html").send(uploadPageHtml(check.ok ? { state: "ready", documentType: row!.documentType } : { state: "closed" }));
  } catch { res.status(500).type("html").send(uploadPageHtml({ state: "closed" })); }
});

router.post("/vault/upload/:token",
  raw({ type: ["application/pdf", "image/png", "image/jpeg", "application/octet-stream"], limit: VAULT_MAX_UPLOAD_BYTES }),
  async (req, res) => {
    noStore(res);
    try {
      const docKey = typeof req.query["doc"] === "string" ? req.query["doc"] : undefined;
      const result = await acceptUpload(String(req.params["token"] ?? ""), req.body, docKey);
      if (result.ok) { res.status(201).json({ status: "pending" }); return; }
      const code = result.error === "unsupported_file" ? 415 : result.error === "already_uploaded" ? 409 : result.error === "upload_failed" ? 502 : 410;
      res.status(code).json({ error: result.error });
    } catch { res.status(500).json({ error: "vault_upload_failed" }); }
  });

router.get("/vault/documents", requireAuth, async (req, res) => {
  noStore(res);
  try { res.json({ documents: await listOwnDocumentStatuses({ id: req.authUser!.id, role: req.authUser!.role }) }); }
  catch { res.status(500).json({ error: "vault_status_failed" }); }
});

router.post("/vault/documents/:documentId/deletion-request", requireAuth, async (req, res) => {
  noStore(res);
  const id = z.string().uuid().safeParse(req.params["documentId"]);
  if (!id.success) { res.status(400).json({ error: "invalid_document" }); return; }
  try {
    const result = await requestDocumentDeletion({ id: req.authUser!.id, role: req.authUser!.role }, id.data);
    if (!result.ok) { res.status(404).json({ error: "not_found" }); return; }
    res.status(202).json({ status: "requested" });
  } catch { res.status(500).json({ error: "vault_deletion_request_failed" }); }
});

export default router;
