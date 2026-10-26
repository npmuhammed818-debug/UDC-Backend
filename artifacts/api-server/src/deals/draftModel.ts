import { UDC_DRAFT_WARNING_BOTTOM, UDC_DRAFT_WARNING_TOP } from "./draftWarning.ts";
import type { SpaDraftInput } from "./spaDraft.ts";

export type DraftType = "LOI" | "ICPO" | "FCO" | "SPA" | "NCNDA";
export type Block =
  | { k: "h"; t: string }
  | { k: "p"; t: string }
  | { k: "kv"; rows: Array<[string, string]> }
  | { k: "cl"; n: string; t: string }
  | { k: "sig"; parties: string[] };
export type DraftModel = { type: DraftType; title: string; subtitle: string; ref: string; blocks: Block[] };

const clean = (v: string | null | undefined, fallback: string) => v?.replace(/[\r\n\t]+/g, " ").trim() || fallback;

// Exact decimal helpers on strings. Nothing is rounded: a value that does not fit is left for the parties to confirm.
function parseDecimal(value: string | null | undefined): { int: bigint; scale: number } | null {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(value ?? "");
  if (!m) return null;
  const frac = m[2] ?? "";
  return { int: BigInt(m[1]! + frac), scale: frac.length };
}
function group(digits: string) { return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function show(d: { int: bigint; scale: number }, minDecimals: number) {
  let s = d.int.toString().padStart(d.scale + 1, "0");
  let whole = s.slice(0, s.length - d.scale), frac = d.scale ? s.slice(-d.scale) : "";
  frac = frac.replace(/0+$/, "");
  while (frac.length < minDecimals) frac += "0";
  return group(whole) + (frac ? "." + frac : "");
}
export function formatAmount(value: string | null | undefined, fallback: string, minDecimals = 0) {
  const d = parseDecimal(value); return d ? show(d, minDecimals) : fallback;
}
export function totalValue(qty: string | null | undefined, price: string | null | undefined) {
  const q = parseDecimal(qty), p = parseDecimal(price);
  if (!q || !p) return null;
  const int = q.int * p.int, scale = q.scale + p.scale;
  // Keep exact: trailing zeros are dropped, and anything beyond 2 decimals is shown as is, never rounded.
  return show({ int, scale }, 2);
}

function termsRows(i: SpaDraftInput): Array<[string, string]> {
  const unit = clean(i.unit, "[UNIT]"), cur = clean(i.currency, "[CURRENCY]");
  const total = totalValue(i.quantity, i.agreedPrice);
  return [
    ["Product", clean(i.productName, "[PRODUCT AND GRADE]")],
    ["Specification", "[ATTACH SPECIFICATION: grade, purity, packaging]"],
    ["Quantity", `${formatAmount(i.quantity, "[QUANTITY]")} ${unit}  (tolerance: [+/- __ %])`],
    ["Unit price", `${cur} ${formatAmount(i.agreedPrice, "[PRICE]", 2)} per ${unit}`],
    ["Indicative total value", total ? `${cur} ${total}\n(quantity x unit price, before tolerance and adjustments)` : "[CONFIRM WITH THE PARTIES]"],
    ["Delivery term", clean(i.incoterm, "[INCOTERM]")],
    ["Destination", clean(i.destination, "[NAMED DESTINATION]")],
    ["Payment", i.paymentTerms ? clean(i.paymentTerms, "") + " (instrument wording to be agreed by the parties' banks)" : "Documentary letter of credit (DLC) at sight, wording to be agreed by the parties' banks"],
    ["Inspection", i.inspectionTerms ? clean(i.inspectionTerms, "") : "Independent inspection at destination, inspector to be agreed"],
  ];
}
function partyRow(role: "Buyer" | "Seller", name: string | null | undefined, address: string | null | undefined, reg: string | null | undefined, hidden: boolean | undefined): [string, string] {
  if (hidden) return [role, `[${role.toUpperCase()} - disclosed after NCNDA]`];
  return [role, clean(name, `[${role.toUpperCase()} LEGAL NAME]`) + "\n" + clean(address, "[REGISTERED ADDRESS]") + " | " + clean(reg, "[REGISTRATION NO.]")];
}
function parties(i: SpaDraftInput): Block {
  return { k: "kv", rows: [
    partyRow("Buyer", i.buyerName, i.buyerAddress, i.buyerRegistrationNo, i.hideBuyer),
    partyRow("Seller", i.sellerName, i.sellerAddress, i.sellerRegistrationNo, i.hideSeller),
    ["Introducing agent", "UDC - introduces the parties only; not the buyer or seller [LAWYER TO CONFIRM ROLE]"],
  ] };
}
const AGENT = "UDC introduced the parties and acts only as an introducing agent. The sale contract is between the Buyer and the Seller. Any agent commission is agreed separately in writing: [LAWYER TO SET]. UDC gives no guarantee of product, funds, quality or delivery.";
function clauses(items: Array<[string, string[]]>): Block[] {
  const out: Block[] = []; items.forEach(([h, ts], idx) => { out.push({ k: "h", t: `${idx + 1}. ${h}` }); ts.forEach((t, j) => out.push({ k: "cl", n: `${idx + 1}.${j + 1}`, t })); });
  return out;
}
const head = (i: SpaDraftInput): Block => ({ k: "p", t: `Date: ${clean(i.date, "[DATE]")}   |   UDC deal reference: ${clean(i.dealNumber, "[DEAL REFERENCE]")}` });
const refOf = (i: SpaDraftInput, t: DraftType) => `${clean(i.dealNumber, "DEAL")}-${t}`;
const SIGN_B = "[AUTHORIZED SIGNATORY]";

export function buildDraftModel(type: DraftType, i: SpaDraftInput): DraftModel {
  const model = buildBaseModel(type, i);
  if (i.governingLaw !== "India") return model;
  // India option: only the open governing-law slot changes, and it stays marked for the lawyer.
  const slot = /\[(?:TO BE AGREED WITH|AGREE WITH) COUNSEL\]/g;
  return { ...model, blocks: model.blocks.map(b => b.k === "cl" ? { ...b, t: b.t.replace(slot, "India. [LAWYER TO CONFIRM]") } : b) };
}

function buildBaseModel(type: DraftType, i: SpaDraftInput): DraftModel {
  const ref = refOf(i, type);
  if (type === "LOI") return { type, ref, title: "Letter of Intent", subtitle: "Buyer to Seller  |  Non-binding", blocks: [head(i), { k: "h", t: "Parties" }, parties(i), { k: "h", t: "Proposed transaction" }, { k: "kv", rows: termsRows(i) },
    ...clauses([
      ["Statement of intent", ["The Buyer states its intention to purchase, and the Seller its intention to sell, the goods described above on the terms in this letter, subject to a definitive sale and purchase agreement signed by both parties."]],
      ["Next steps", ["The Seller will send its Full Corporate Offer (FCO) with full product and supply details.", "The parties will negotiate and sign a sale and purchase agreement (SPA). Neither party may rely on this letter as a binding contract."]],
      ["Non-binding effect", ["This letter records current intent only. It creates no obligation to buy or sell, and no obligation to pay any fee, commission or penalty.", "No party may treat any statement in this letter as a guarantee of product, funds, or delivery."]],
      ["Confidentiality", ["Each party keeps the terms of this letter and the other party's details confidential, and uses them only to evaluate this transaction. [SCOPE, DURATION AND EXCEPTIONS: LAWYER TO SET]."]],
      ["Introducing agent", [AGENT]],
      ["Validity and law", ["This letter is open for acceptance until [VALIDITY DATE]. Governing law and dispute forum: [TO BE AGREED WITH COUNSEL]."]],
    ]), { k: "sig", parties: ["For the Buyer", "Acknowledged for the Seller"] }] };
  if (type === "ICPO") return { type, ref, title: "Purchase Order Intent (ICPO)", subtitle: "Buyer to Seller  |  Non-binding until an SPA is signed", blocks: [head(i), { k: "h", t: "Parties" }, parties(i), { k: "h", t: "Order details" }, { k: "kv", rows: termsRows(i) },
    { k: "h", t: "Buyer's bank details (for bank-to-bank verification)" }, { k: "kv", rows: [["Bank name", "[BUYER BANK NAME]"], ["Bank address", "[BANK ADDRESS]"], ["SWIFT / BIC", "[SWIFT]"], ["Bank officer", "[NAME, TITLE, PHONE, EMAIL]"]] },
    ...clauses([
      ["Purchase intent", ["The Buyer confirms its intention to purchase the goods above at the stated price and delivery term, once the parties sign an SPA.", "The unit price is the price recorded in UDC for this deal. It is not final until the SPA."]],
      ["Buyer confirmations", ["The Buyer confirms that it has authority to sign this document for the company named above, and that the information in it is true to the best of its knowledge."]],
      ["What this document is not", ["It is not a bank instrument, a payment guarantee, or proof of funds. It does not release any money.", "It does not bind either party to buy or sell until an SPA is signed by both."]],
      ["Introducing agent", [AGENT]],
      ["Validity and law", ["Valid until [VALIDITY DATE]. Governing law and forum: [TO BE AGREED WITH COUNSEL]."]],
    ]), { k: "sig", parties: ["For the Buyer"] }] };
  if (type === "FCO") return { type, ref, title: "Full Corporate Offer (FCO)", subtitle: "Seller to Buyer  |  Non-binding until an SPA is signed", blocks: [head(i), { k: "h", t: "Parties" }, parties(i), { k: "h", t: "Offer details" }, { k: "kv", rows: termsRows(i) },
    { k: "h", t: "Offer conditions" }, { k: "kv", rows: [["Offer valid until", "[VALIDITY DATE]"], ["Shipment period", "[SHIPMENT PERIOD]"], ["Origin", "[COUNTRY OF ORIGIN]"], ["Packing", "[PACKING]"], ["Documents offered", "Commercial invoice, bill of lading, certificate of origin, quality and quantity certificates"]] },
    ...clauses([
      ["Offer", ["The Seller offers to sell the goods above to the Buyer on these terms, subject to a signed SPA."]],
      ["Seller confirmations", ["The Seller confirms that it has the right to sell the goods or a written mandate to offer them, and the authority to sign this document.", "These confirmations are statements by the Seller. UDC has not verified them."]],
      ["Acceptance", ["The Buyer may accept by countersigning and returning this offer before the validity date. Acceptance leads to SPA negotiation. It does not form a sale contract."]],
      ["Introducing agent", [AGENT]],
      ["What this document is not", ["It is not a guarantee of product availability, quality or delivery, and no payment is due under it."]],
    ]), { k: "sig", parties: ["For the Seller", "Accepted by the Buyer"] }] };
  if (type === "SPA") return { type, ref, title: "Sale and Purchase Agreement", subtitle: "Draft for discussion  |  Not binding until signed by both parties", blocks: [head(i), { k: "h", t: "Parties" }, parties(i), { k: "h", t: "Commercial summary" }, { k: "kv", rows: termsRows(i) },
    ...clauses([
      ["Sale and purchase", ["The Seller sells and the Buyer buys the goods described in the commercial summary, on the terms of this agreement."]],
      ["Quality and quantity", ["The goods must match the specification attached to this agreement: [ATTACH SPECIFICATION].", "Quantity tolerance and how it affects price: [LAWYER TO SET]."]],
      ["Price and payment", ["The unit price is stated in the summary. Payment is as stated in the summary, with any letter of credit issued by [ISSUING BANK] within [__] days of signing, on wording agreed by the banks.", "Taxes, duties and bank charges: [ALLOCATE BETWEEN PARTIES]."]],
      ["Delivery, title and risk", ["Delivery follows the delivery term and destination in the summary, within the period [SHIPMENT PERIOD].", "Title and risk pass as the delivery term rules and [LAWYER TO CONFIRM]."]],
      ["Inspection and documents", ["An independent inspector, [NAME], inspects as stated in the summary. The seller provides: commercial invoice, bill of lading, certificate of origin, quality and quantity certificates, [OTHERS]."]],
      ["Default and remedies", ["Events of default, cure periods, claims and termination: [TO BE DRAFTED BY THE PARTIES' COUNSEL]."]],
      ["Force majeure", ["Events that suspend obligations, notice and time limits: [TO BE DRAFTED BY COUNSEL]."]],
      ["Confidentiality", ["Each party keeps the terms and the other party's information confidential: [SCOPE AND DURATION]."]],
      ["Law and disputes", ["Governing law, seat and rules of arbitration or courts: [AGREE WITH COUNSEL]."]],
      ["Introducing agent", [AGENT]],
      ["Notices and entire agreement", ["Notices go to the addresses above or by written notice of change. This agreement is the whole agreement. Changes need a written document signed by both parties."]],
    ]), { k: "sig", parties: ["For the Buyer", "For the Seller"] }] };
  return { type, ref, title: "Mutual Non-Disclosure and Non-Circumvention Agreement", subtitle: "Draft for discussion", blocks: [head(i), { k: "h", t: "Parties" }, parties(i),
    ...clauses([
      ["Purpose", [`The parties wish to discuss the transaction under UDC deal reference ${clean(i.dealNumber, "[DEAL REFERENCE]")} and will share confidential information only for that purpose.`]],
      ["Confidential information", ["Means non-public commercial terms, prices, documents and the identities of introduced parties, marked or reasonably understood as confidential.", "It excludes information that is public without breach, already lawfully known, independently developed, or lawfully received from another source."]],
      ["Duty of confidence", ["Each party must keep the information secret, use it only for the purpose, and share it only with advisers and staff who need it and are bound to confidence.", "Disclosure required by law is allowed, with prompt notice to the other party where lawful."]],
      ["Non-circumvention", ["For [DURATION], a party must not knowingly deal directly with a counterparty introduced under this agreement to avoid the introducing party, for the transaction identified above.", "Scope, exceptions and territory: [LAWYER TO SET]. An introduction alone does not give ownership of a customer."]],
      ["Fees and UDC role", ["UDC acts only as an introducing agent between the parties and is not a buyer or seller of the goods.", "No fee or commission arises from this agreement. Any commission, including any agent commission for UDC as introducing agent, needs a separate written agreement naming payer, recipient, amount and trigger: [LAWYER TO SET]."]],
      ["Term, law and disputes", ["This agreement lasts [TERM] from signing. Governing law and forum: [AGREE WITH COUNSEL]. Remedies: [LAWYER TO SET]."]],
    ]), { k: "sig", parties: ["For the Buyer", "For the Seller"] }] };
}

export function renderModelText(m: DraftModel) {
  const lines = [UDC_DRAFT_WARNING_TOP, "", m.title.toUpperCase(), m.subtitle, `Ref: ${m.ref}`, ""];
  for (const b of m.blocks) {
    if (b.k === "h") lines.push("", b.t);
    else if (b.k === "p") lines.push(b.t);
    else if (b.k === "kv") b.rows.forEach(([a, v]) => lines.push(`${a}: ${v.replace(/\n/g, " ")}`));
    else if (b.k === "cl") lines.push(`${b.n} ${b.t}`);
    else b.parties.forEach(p => lines.push("", p, "Signature: ______________________", "Name: [AUTHORIZED SIGNATORY]  Title: [TITLE]  Date: ____________"));
  }
  lines.push("", UDC_DRAFT_WARNING_BOTTOM);
  return lines.join("\n");
}
