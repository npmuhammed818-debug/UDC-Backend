// Late-bound link issuer so chat code can offer a vault link without importing the database layer.
export type VaultLinkIssuer = (
  user: { id: string; role: string },
  documentType: string,
) => Promise<{ ok: true; url: string; expiresAt: Date } | { ok: false; error: string }>;
let issuer: VaultLinkIssuer | null = null;
export const setVaultLinkIssuer = (fn: VaultLinkIssuer | null) => { issuer = fn; };
export const getVaultLinkIssuer = () => issuer;
