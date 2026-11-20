// src/supabase/documentAccessPath.ts
var prefix = "storage://udc-documents/";
var segment = /^[A-Za-z0-9._-]{1,180}$/;
function managedPath(value, namespace, ownerId) {
  if (typeof value !== "string" || typeof ownerId !== "string" || !ownerId || !segment.test(ownerId) || !value.startsWith(prefix)) return null;
  const path = value.slice(prefix.length);
  if (path.includes("%") || path.includes("?") || path.includes("#") || path.includes("\\") || path.includes("//")) return null;
  const parts = path.split("/");
  if (parts.length < 3 || parts[0] !== namespace || parts[1] !== ownerId || parts.slice(2).some((part) => !segment.test(part) || part === "." || part === "..")) return null;
  return path;
}
function managedDealDocumentPath(value, dealId) {
  return managedPath(value, "deals", dealId);
}
function managedCompanyDocumentPath(value, companyId) {
  return managedPath(value, "companies", companyId);
}
export {
  managedCompanyDocumentPath,
  managedDealDocumentPath
};
