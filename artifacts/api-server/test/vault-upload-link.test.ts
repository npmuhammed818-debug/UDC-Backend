import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VAULT_DOCUMENT_TYPES, VAULT_LINK_TTL_MS, checkUploadLink, hashLinkToken, issueUploadLinkToken, looksLikeConfidentialDocumentTopic,
  parseMultiDocumentType, publicDocumentStatus, sniffUpload, uploadPageUrl, vaultObjectPath, vaultRedirectReply,
} from "../src/vault/uploadLink.ts";
import { managedCompanyDocumentPath } from "../src/supabase/documentAccessPath.ts";
import { uploadPageHtml } from "../src/vault/uploadPage.ts";

const now = new Date("2026-10-25T10:00:00Z");

test("link token: 15-minute expiry, hash-only storage, single use, revocation", () => {
  const a = issueUploadLinkToken(now), b = issueUploadLinkToken(now);
  assert.notEqual(a.token, b.token);
  assert.equal(a.expiresAt.getTime() - now.getTime(), 15 * 60_000);
  assert.equal(VAULT_LINK_TTL_MS, 15 * 60_000);
  assert.equal(a.tokenHash, hashLinkToken(a.token));
  assert.ok(!a.tokenHash.includes(a.token));
  const rec = { tokenHash: a.tokenHash, expiresAt: a.expiresAt, usedAt: null, revokedAt: null };
  assert.deepEqual(checkUploadLink(rec, a.token, now), { ok: true });
  assert.deepEqual(checkUploadLink(rec, a.token, new Date(a.expiresAt.getTime() - 1)), { ok: true });
  assert.deepEqual(checkUploadLink(rec, a.token, a.expiresAt), { ok: false, reason: "expired" });
  assert.deepEqual(checkUploadLink({ ...rec, usedAt: now }, a.token, now), { ok: false, reason: "used" });
  assert.deepEqual(checkUploadLink({ ...rec, revokedAt: now }, a.token, now), { ok: false, reason: "revoked" });
  assert.deepEqual(checkUploadLink(rec, b.token, now), { ok: false, reason: "invalid" });
  for (const bad of [undefined, null, "", "short", "x".repeat(300), 42]) {
    assert.deepEqual(checkUploadLink(rec, bad, now), { ok: false, reason: "invalid" });
  }
  assert.deepEqual(checkUploadLink(null, a.token, now), { ok: false, reason: "invalid" });
});

test("uploads are judged by their bytes, not declared type or name", () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(20)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  assert.equal(sniffUpload(pdf)?.extension, "pdf");
  assert.equal(sniffUpload(png)?.contentType, "image/png");
  assert.equal(sniffUpload(jpg)?.contentType, "image/jpeg");
  assert.equal(sniffUpload(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffUpload(Buffer.from("MZ executable bytes here")), null);
  assert.equal(sniffUpload(Buffer.alloc(4)), null);
  assert.equal(sniffUpload(Buffer.concat([pdf, Buffer.alloc(8 * 1024 * 1024)])), null);
  assert.equal(sniffUpload("%PDF-1.4 string not buffer"), null);
});

test("vault object path stays inside the owner's company namespace", () => {
  const company = "33333333-3333-4333-8333-333333333333";
  const path = vaultObjectPath(company, "44444444-4444-4444-8444-444444444444", { extension: "pdf", contentType: "application/pdf" });
  assert.equal(managedCompanyDocumentPath(`storage://udc-documents/${path}`, company), path);
  assert.equal(managedCompanyDocumentPath(`storage://udc-documents/${path}`, "55555555-5555-4555-8555-555555555555"), null);
});

test("users and AKIF only ever see outcome states", () => {
  assert.equal(publicDocumentStatus("approved"), "verified");
  assert.equal(publicDocumentStatus("rejected"), "rejected");
  assert.equal(publicDocumentStatus("pending"), "pending");
  assert.equal(publicDocumentStatus("anything_else"), "unverified");
  assert.equal(publicDocumentStatus(undefined), "unverified");
});

test("WhatsApp redirect never invites attachments and carries only the link", () => {
  const url = uploadPageUrl("https://udc.example.invalid/", "abc_DEF-123");
  assert.equal(url, "https://udc.example.invalid/u/abc_DEF-123");
  const withLink = vaultRedirectReply({ url, expiresAt: now });
  assert.ok(withLink.includes(url) && /15 minutes/.test(withLink) && /never the document/.test(withLink));
  assert.ok(!/send (it|them) here/i.test(withLink));
  assert.ok(/don't send/i.test(vaultRedirectReply()));
  for (const t of ["here is my passport", "Bank Statement attached", "trade license copy", "KYC docs"]) assert.ok(looksLikeConfidentialDocumentTopic(t), t);
  for (const t of ["I want 500 MT copper cathode", "what is DLC?", ""]) assert.ok(!looksLikeConfidentialDocumentTopic(t), t);
});

test("upload page escapes content and closed state reveals nothing", () => {
  assert.ok(!uploadPageHtml({ state: "ready", documentType: "<script>x</script>" }).includes("<script>x"));
  const closed = uploadPageHtml({ state: "closed" });
  assert.ok(/expired or was already used/.test(closed) && !/<input/.test(closed));
});

test("webhook never downloads or stores confidential files and offers the vault instead", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  const gate = src.indexOf("looksLikeConfidentialDocumentTopic(confidentialText)");
  const download = src.indexOf("await downloadWhatsAppMedia(document.id)");
  assert.ok(gate > 0 && download > 0 && gate < download, "confidential check must run before any media download");
});

test("accepted deal uploads carry the sensitive-file warning", async () => {
  const { readFile } = await import("node:fs/promises");
  const { SENSITIVE_UPLOAD_WARNING } = await import("../src/vault/uploadLink.ts");
  assert.match(SENSITIVE_UPLOAD_WARNING, /don't send sensitive/);
  assert.match(SENSITIVE_UPLOAD_WARNING, /Menu, then Documents/);
  const src = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.ok(src.includes("I’ll keep it here for review.\\n\\n${SENSITIVE_UPLOAD_WARNING}"));
});

test("vault public base rejects credential-bearing, non-origin and insecure destinations",()=>{
  for(const base of ["http://vault.example.invalid","https://u:p@vault.example.invalid","https://vault.example.invalid/path","https://vault.example.invalid/?x=1","https://vault.example.invalid/#fragment","https://"])
    assert.throws(()=>uploadPageUrl(base,"synthetic-token"),/invalid_vault_public_origin/);
});

test("multi document links carry several checklist keys", () => {
  for (const key of ["tax_id", "import_licence", "export_licence", "product_licence", "past_exports"]) {
    assert.ok((VAULT_DOCUMENT_TYPES as readonly string[]).includes(key), key);
  }
  assert.deepEqual(parseMultiDocumentType("multi:company_registration,tax_id,import_licence"), ["company_registration", "tax_id", "import_licence"]);
  assert.equal(parseMultiDocumentType("multi:company_registration,nope"), null);
  assert.equal(parseMultiDocumentType("multi:"), null);
  assert.equal(parseMultiDocumentType("company_registration"), null);
  assert.equal(parseMultiDocumentType(42), null);
});

test("the multi upload page takes one file per expected document", () => {
  const html = uploadPageHtml({ state: "ready", documentType: "multi:company_registration,tax_id" });
  assert.match(html, /data-doc="company_registration"/);
  assert.match(html, /data-doc="tax_id"/);
  assert.match(html, /Company registration or trade licence/);
  assert.match(html, /Tax ID/);
  assert.match(html, /\?doc=/);
  assert.match(html, /one tap uploads them all/);
  assert.match(html, /Upload all securely/);
  const single = uploadPageHtml({ state: "ready", documentType: "tax_id" });
  assert.match(single, /Tax ID/);
  assert.doesNotMatch(single, /data-doc/);
});

test("short /u/<token> router is mounted before the web app catch-all in app.ts", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  const mount = source.indexOf("app.use(vaultShortRouter);");
  const staticMount = source.indexOf("app.use(express.static(");
  const apiMount = source.indexOf('app.use("/api", router);');
  assert.ok(mount !== -1, "vaultShortRouter must be mounted");
  assert.ok(staticMount !== -1 && mount < staticMount, "vaultShortRouter must mount before express.static and the SPA fallback");
  assert.ok(apiMount !== -1 && mount < apiMount, "vaultShortRouter mounts ahead of /api");
});
