export type ResearchIntent = {
  direction: "buyer" | "seller";
  product: string;
  targetCountry: string;
};

export function parseResearchIntent(text: string): ResearchIntent | null {
  const normalized = " " + text.trim().replace(/\s+/g, " ") + " ";
  const match = normalized.match(
    /\b(?:find|search|look for|discover)\s+(buyers?|sellers?)\s+(?:for|of)\s+(.+?)\s+(?:in|from)\s+([A-Za-z][A-Za-z .'-]{1,80})\s*$/i,
  );
  if (!match) return null;

  const role = match[1]?.toLowerCase() ?? "";
  const product = match[2]?.trim() ?? "";
  const targetCountry = match[3]?.trim() ?? "";
  if (!product || !targetCountry) return null;

  return {
    direction: role.startsWith("buyer") ? "buyer" : "seller",
    product,
    targetCountry,
  };
}
