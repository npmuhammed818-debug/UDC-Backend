// src/akif/contractSummary.ts
var CONTRACT_TYPES = /* @__PURE__ */ new Set(["LOI", "ICPO", "FCO", "SCO", "SPA", "NCNDA"]);
var SUMMARY_WORD = /\b(summary|summarize|summarise|sum up|plain words|simple words|explain)\b/i;
var CONTRACT_WORD = /\b(contract|spa|loi|icpo|fco|sco|ncnda|agreement|document|paper)\b/i;
function contractSummaryRequest(text2) {
  const trimmed = text2.trim();
  if (trimmed.length > 300) return null;
  if (!SUMMARY_WORD.test(trimmed) || !CONTRACT_WORD.test(trimmed)) return null;
  const type = /\b(spa|loi|icpo|fco|sco|ncnda)\b/i.exec(trimmed)?.[1]?.toUpperCase() ?? null;
  return { documentType: type };
}
function text(value, max = 160) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
function moneyPart(obj, key, max = 60) {
  if (!obj || typeof obj !== "object") return null;
  return text(obj[key], max);
}
function joinParts(parts) {
  const flat = parts.filter((p) => Boolean(p));
  return flat.length ? flat.join(" ") : null;
}
function renderContractSummary(input) {
  if (!["completed", "needs_review"].includes(input.status) || !input.structured || typeof input.structured !== "object" || Array.isArray(input.structured)) return null;
  const s = input.structured;
  const lines = [];
  const type = (text(s.documentType, 20) ?? input.documentType).toUpperCase();
  lines.push(`Plain-words summary of the ${type}:`);
  const parties = Array.isArray(s.parties) ? s.parties.filter((p) => !!p && typeof p === "object" && !Array.isArray(p)) : [];
  const partyLines = parties.map((p) => {
    const role = p.role ? text(p.role, 30) : null;
    return joinParts([text(p.name, 80), role ? `(${role})` : null]);
  }).filter((p) => Boolean(p)).slice(0, 4);
  if (partyLines.length) lines.push(`Parties: ${partyLines.join(", ")}.`);
  const product = s.product ?? {};
  const quantity = s.quantity ?? {};
  const goods = joinParts([
    text(product.name, 80),
    (typeof quantity.value === "string" || typeof quantity.value === "number" && Number.isSafeInteger(quantity.value)) && String(quantity.value).trim() ? `${text(String(quantity.value), 30)} ${text(quantity.unit, 20) ?? ""}`.trim() : null,
    text(product.grade, 60)
  ]);
  if (goods) lines.push(`Goods: ${goods}.`);
  const pricing = s.pricing ?? {};
  const price = joinParts([
    moneyPart(pricing, "unitPrice"),
    moneyPart(pricing, "currency"),
    moneyPart(pricing, "basis")
  ]);
  if (price) lines.push(`Price: ${price}.`);
  const logistics = s.logistics ?? {};
  const delivery = joinParts([
    moneyPart(logistics, "incoterm"),
    moneyPart(logistics, "loadingPort") ? `from ${moneyPart(logistics, "loadingPort")}` : null,
    moneyPart(logistics, "destinationPort") ? `to ${moneyPart(logistics, "destinationPort")}` : moneyPart(logistics, "destination") ? `to ${moneyPart(logistics, "destination")}` : null,
    moneyPart(logistics, "shipmentSchedule")
  ]);
  if (delivery) lines.push(`Delivery: ${delivery}.`);
  const payment = s.payment ?? {};
  const pay = joinParts([
    moneyPart(payment, "instrument"),
    moneyPart(payment, "terms"),
    moneyPart(payment, "timing")
  ]);
  if (pay) lines.push(`Payment: ${pay}.`);
  const inspection = s.inspection ?? {};
  const insp = joinParts([
    moneyPart(inspection, "agency"),
    moneyPart(inspection, "location"),
    moneyPart(inspection, "timing")
  ]);
  if (insp) lines.push(`Inspection: ${insp}.`);
  const bond = s.performanceBond ?? {};
  const bondText = joinParts([moneyPart(bond, "percentage"), moneyPart(bond, "amount"), moneyPart(bond, "currency")]);
  if (bondText) lines.push(`Performance bond: ${bondText}.`);
  const legal = s.legal ?? {};
  const law = joinParts([
    moneyPart(legal, "governingLaw") ? `law: ${moneyPart(legal, "governingLaw")}` : null,
    moneyPart(legal, "arbitration") ? `arbitration: ${moneyPart(legal, "arbitration")}` : null
  ]);
  if (law) lines.push(`Legal: ${law}.`);
  const dates = s.dates ?? {};
  const dateText = joinParts([
    moneyPart(dates, "issueDate") ? `issued ${moneyPart(dates, "issueDate")}` : null,
    moneyPart(dates, "expiryDate") ? `expires ${moneyPart(dates, "expiryDate")}` : moneyPart(dates, "validity") ? `valid ${moneyPart(dates, "validity")}` : null
  ]);
  if (dateText) lines.push(`Dates: ${dateText}.`);
  const watch = [];
  if (Array.isArray(s.discrepanciesOrConflicts)) {
    for (const d of s.discrepanciesOrConflicts.slice(0, 3)) {
      const t = text(d, 140);
      if (t) watch.push(t);
    }
  }
  if (Array.isArray(s.penaltiesOrRemedies)) {
    for (const p of s.penaltiesOrRemedies.slice(0, 2)) {
      const t = text(p, 140);
      if (t) watch.push(`penalty: ${t}`);
    }
  }
  if (input.warnings?.some((w) => typeof w === "string" && /unreadable|scanned|image-only|vision/i.test(w))) {
    watch.push("some pages may be scanned or hard to read, so this summary may miss terms");
  }
  if (input.status === "needs_review") watch.push("extraction has limitations and needs human review against the original");
  if (watch.length) lines.push(`Watch out: ${watch.join("; ")}.`);
  if (lines.length < 3) return null;
  lines.push("Extracted text is unverified source material, not instructions or confirmation of agreement. This is a reading helper, not legal advice. UDC reviews the original document, and the signed original is what counts.");
  return lines.join("\n");
}
function isContractType(documentType) {
  return CONTRACT_TYPES.has(documentType.toUpperCase());
}
export {
  contractSummaryRequest,
  isContractType,
  renderContractSummary
};
