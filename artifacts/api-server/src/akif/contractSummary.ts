// Plain-words contract summary built DETERMINISTICALLY from the structured
// extraction of an uploaded contract (LOI/ICPO/FCO/SCO/SPA/NCNDA). No model
// writes the summary: every value comes straight from the extraction record,
// so numbers cannot be invented here. The summary is a reading helper only -
// it never says the contract is good, safe or approved.

type Structured = Record<string, unknown>;

const CONTRACT_TYPES = new Set(["LOI", "ICPO", "FCO", "SCO", "SPA", "NCNDA"]);
const SUMMARY_WORD = /\b(summary|summarize|summarise|sum up|plain words|simple words|explain)\b/i;
const CONTRACT_WORD = /\b(contract|spa|loi|icpo|fco|sco|ncnda|agreement|document|paper)\b/i;

export function contractSummaryRequest(text: string): { documentType: string | null } | null {
  const trimmed = text.trim();
  if (trimmed.length > 300) return null;
  if (!SUMMARY_WORD.test(trimmed) || !CONTRACT_WORD.test(trimmed)) return null;
  const type = /\b(spa|loi|icpo|fco|sco|ncnda)\b/i.exec(trimmed)?.[1]?.toUpperCase() ?? null;
  return { documentType: type };
}

function text(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function moneyPart(obj: unknown, key: string, max = 60): string | null {
  if (!obj || typeof obj !== "object") return null;
  return text((obj as Structured)[key], max);
}

function joinParts(parts: (string | null)[]): string | null {
  const flat = parts.filter((p): p is string => Boolean(p));
  return flat.length ? flat.join(" ") : null;
}

/** Renders the summary. Returns null when the extraction has too little to say. */
export function renderContractSummary(input: {
  documentType: string;
  structured: Structured;
  warnings?: string[] | null;
  status: string;
}): string | null {
  const s = input.structured;
  const lines: string[] = [];
  const type = (text(s.documentType, 20) ?? input.documentType).toUpperCase();
  lines.push(`Plain-words summary of the ${type}:`);

  const parties = Array.isArray(s.parties) ? (s.parties as Structured[]) : [];
  const partyLines = parties
    .map((p) => joinParts([text(p.name, 80), p.role ? `(${text(p.role, 30)})` : null]))
    .filter((p): p is string => Boolean(p))
    .slice(0, 4);
  if (partyLines.length) lines.push(`Parties: ${partyLines.join(", ")}.`);

  const product = (s.product ?? {}) as Structured;
  const quantity = (s.quantity ?? {}) as Structured;
  const goods = joinParts([
    text(product.name, 80),
    quantity.value ? `${text(String(quantity.value), 30)} ${text(quantity.unit, 20) ?? ""}`.trim() : null,
    text(product.grade, 60),
  ]);
  if (goods) lines.push(`Goods: ${goods}.`);

  const pricing = (s.pricing ?? {}) as Structured;
  const price = joinParts([
    moneyPart(pricing, "unitPrice"),
    moneyPart(pricing, "currency"),
    moneyPart(pricing, "basis"),
  ]);
  if (price) lines.push(`Price: ${price}.`);

  const logistics = (s.logistics ?? {}) as Structured;
  const delivery = joinParts([
    moneyPart(logistics, "incoterm"),
    moneyPart(logistics, "loadingPort") ? `from ${moneyPart(logistics, "loadingPort")}` : null,
    moneyPart(logistics, "destinationPort") ? `to ${moneyPart(logistics, "destinationPort")}` : moneyPart(logistics, "destination") ? `to ${moneyPart(logistics, "destination")}` : null,
    moneyPart(logistics, "shipmentSchedule"),
  ]);
  if (delivery) lines.push(`Delivery: ${delivery}.`);

  const payment = (s.payment ?? {}) as Structured;
  const pay = joinParts([
    moneyPart(payment, "instrument"),
    moneyPart(payment, "terms"),
    moneyPart(payment, "timing"),
  ]);
  if (pay) lines.push(`Payment: ${pay}.`);

  const inspection = (s.inspection ?? {}) as Structured;
  const insp = joinParts([
    moneyPart(inspection, "agency"),
    moneyPart(inspection, "location"),
    moneyPart(inspection, "timing"),
  ]);
  if (insp) lines.push(`Inspection: ${insp}.`);

  const bond = (s.performanceBond ?? {}) as Structured;
  const bondText = joinParts([moneyPart(bond, "percentage"), moneyPart(bond, "amount"), moneyPart(bond, "currency")]);
  if (bondText) lines.push(`Performance bond: ${bondText}.`);

  const legal = (s.legal ?? {}) as Structured;
  const law = joinParts([
    moneyPart(legal, "governingLaw") ? `law: ${moneyPart(legal, "governingLaw")}` : null,
    moneyPart(legal, "arbitration") ? `arbitration: ${moneyPart(legal, "arbitration")}` : null,
  ]);
  if (law) lines.push(`Legal: ${law}.`);

  const dates = (s.dates ?? {}) as Structured;
  const dateText = joinParts([
    moneyPart(dates, "issueDate") ? `issued ${moneyPart(dates, "issueDate")}` : null,
    moneyPart(dates, "expiryDate") ? `expires ${moneyPart(dates, "expiryDate")}` : moneyPart(dates, "validity") ? `valid ${moneyPart(dates, "validity")}` : null,
  ]);
  if (dateText) lines.push(`Dates: ${dateText}.`);

  const watch: string[] = [];
  if (Array.isArray(s.discrepanciesOrConflicts)) {
    for (const d of (s.discrepanciesOrConflicts as unknown[]).slice(0, 3)) {
      const t = text(d, 140);
      if (t) watch.push(t);
    }
  }
  if (Array.isArray(s.penaltiesOrRemedies)) {
    for (const p of (s.penaltiesOrRemedies as unknown[]).slice(0, 2)) {
      const t = text(p, 140);
      if (t) watch.push(`penalty: ${t}`);
    }
  }
  if (input.warnings?.some((w) => /unreadable|scanned|image-only|vision/i.test(w)) || input.status === "needs_review") {
    watch.push("some pages may be scanned or hard to read, so this summary may miss terms");
  }
  if (watch.length) lines.push(`Watch out: ${watch.join("; ")}.`);

  if (lines.length < 3) return null; // not enough extracted to summarize honestly
  lines.push("This is a reading helper, not legal advice. UDC reviews the original document, and the signed original is what counts.");
  return lines.join("\n");
}

export function isContractType(documentType: string): boolean {
  return CONTRACT_TYPES.has(documentType.toUpperCase());
}
