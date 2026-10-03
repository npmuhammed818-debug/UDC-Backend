export const POLICY_VERSION = "2026-10-04";
export const SUPPORT_EMAIL = "npmuhammed818@gmail.com";
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export const policyLinks = [
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/refunds", "Fees and refunds"],
  ["/cookies", "Cookies"],
  ["/business-details", "Business details"],
  ["/data-deletion", "Data requests"],
];
export function renderPolicy(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | UDC</title><style>body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#17363f;background:#faf8f2;line-height:1.65}a{color:#164d66;text-decoration:underline}a:focus-visible{outline:3px solid #164d66;outline-offset:4px}nav{display:flex;gap:16px;flex-wrap:wrap}h1,h2{line-height:1.3}</style></head><body><header><a href="/">UpDownCircle</a><nav aria-label="Policies">${policyLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav></header><main><h1>${escapeHtml(title)}</h1><p>Updated ${POLICY_VERSION}</p>${body}</main><footer><p>Support and privacy requests: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p></footer></body></html>`;
}
const contact = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;
export const policies: Record<string, [string, string]> = {
  "/privacy": [
    "Privacy policy",
    `<p>UpDownCircle (UDC) supports business trade communication, requirements, offers, verification review, documents and deal tracking.</p><h2>Data and purposes</h2><p>We process the contact and company details you provide, WhatsApp identifiers and messages, trade requirements and offers, uploaded documents, deal records, consent records and security logs to operate these workflows, communicate with you, prevent abuse and resolve issues. Do not send unrelated identity documents, card details, passwords or banking credentials.</p><h2>Sharing and AI processing</h2><p>Relevant trade details may be shared with authorized participants and UDC administrators for the workflow you request. Meta processes WhatsApp communications. Hosting, database/storage and configured AI/document providers process the information needed for their services. AI output assists human review; it does not prove authenticity or provide a final legal opinion. Providers may process information outside your country under their own policies. We do not sell personal information.</p><h2>Retention and protection</h2><p>Records are kept while needed to provide requested services and meet legal, accounting, security or dispute obligations. Access controls and private document storage protect records, but absolute security cannot be guaranteed. Deletion requests include review of documents, messages, storage, provider copies and backups, with retained categories explained to you.</p><h2>Choices and requests</h2><p>Optional notification settings can be changed in the workspace. Contact ${contact} for access, correction, deletion, withdrawal of consent or a privacy grievance, or use <a href="/data-deletion">data requests</a>. Identity checks will be proportionate. Withdrawing consent may prevent UDC from continuing the associated service. Necessary security and requested deal updates may continue while that service remains active.</p><h2>Adults and changes</h2><p>UDC is intended for business representatives aged 18 or older. Do not submit children's data. If children's data has been submitted, contact support for removal review. New web registrations require an adult confirmation. Material policy changes will be dated and communicated through available service channels.</p>`,
  ],
  "/terms": [
    "Terms of service",
    `<p>Use UDC only if you are at least 18 and authorized to represent your business. Provide accurate information and lawful trade requirements. Do not upload stolen documents, impersonate another business, bypass access controls or use UDC for fraud.</p><h2>UDC's role</h2><p>UDC coordinates trade workflows and assists with matching, documents and tracking. Discovery is not verification. Verification describes the recorded review, not a guarantee of performance, stock or authenticity. AKIF output and document drafts require human review. UDC is not a bank, inspection company, law firm or government authority.</p><h2>Trade and payment</h2><p>The UDC workflow uses a DLC issued directly to the seller, with release after SGS inspection at destination. Actual DLC wording, compliant presentation and release depend on the banks, agreed transaction documents and applicable law. Buyers and sellers must approve their transaction documents and obtain appropriate professional advice.</p><h2>Fees and cancellation</h2><p>Commission and service fees must be expressly agreed in writing before a paid service or deal commitment. The agreement must state the payer, calculation, currency, taxes, due event and cancellation/refund terms. No single commission rate applies to all deals. See <a href="/refunds">fees and refunds</a>.</p><h2>Access and disputes</h2><p>UDC may restrict access for security, misuse or legal obligations. Contact support to question a restriction, report an error, cancel a requested service or raise a dispute. These terms do not remove rights or remedies provided by applicable law. Transaction disputes and governing law must be addressed in the agreed transaction contract.</p>`,
  ],
  "/refunds": [
    "Fees, cancellation and refunds",
    `<p>Account registration does not itself authorize a charge. UDC fees and commissions vary by the written agreement. Before agreeing, request the total UDC fee, calculation/rate, currency, payer, taxes, payment trigger and third-party charges. Fees must not be added silently.</p><p>For a paid service, cancellation rights, work already performed and any refundable amount must be disclosed before purchase. A commission is due only under its expressly agreed trigger. Seller goods payments under the DLC and bank, inspection, shipping or other provider charges are governed by their respective agreements; UDC cannot unilaterally reverse them.</p><p>Request cancellation, a fee explanation or a refund review at ${contact}, stating the service/deal reference and charge concerned. Do not send card or banking credentials. UDC will review the agreement and explain the outcome and any applicable processing timeline. Mandatory legal rights remain available.</p>`,
  ],
  "/cookies": [
    "Cookie and browser storage policy",
    `<p>The workspace uses the necessary <code>udc_session</code> cookie for authentication. It is HTTP-only and ends at the session expiry or sign-out. The browser stores a dated cookie-choice record (<code>udc-cookie-choice-v1</code>) for up to 180 days to remember your choice.</p><p>The optional <code>sidebar_state</code> preference cookie remembers layout for up to 7 days, only when you allow preference storage. Choose “Necessary only” to decline it. You can reopen cookie settings at any time in the footer; declining removes the layout cookie. The reviewed workspace contains no advertising or analytics tracker. New optional tracking must be reviewed and gated before activation.</p><p>You can clear storage in your browser settings; clearing the session cookie signs you out. External sites and WhatsApp use their own storage policies.</p>`,
  ],
  "/business-details": [
    "Business details",
    `<p>Trading name: UpDownCircle (UDC).</p><p>Operator contact: Muhammed NP, ${contact}.</p><p>UDC provides B2B trade coordination and workflow support. Business registration, registered address and tax details are not yet published here. Request the contracting party's verified details before entering a paid agreement. UDC does not claim government registration, bank status or regulatory approval on this page.</p>`,
  ],
  "/data-deletion": [
    "Access, correction and deletion requests",
    `<p><a href="/privacy-settings">Open privacy settings</a> in your signed-in workspace to submit and track a deletion-review request. Submission starts a review; it does not immediately erase data or cancel transaction obligations.</p><p>If you cannot sign in, or used WhatsApp without a web account, email ${contact} or use the official UDC WhatsApp channel you already used. State whether you want access, correction, consent withdrawal or deletion and give only the account contact or deal reference needed to locate your records.</p><p>UDC verifies identity proportionately, reviews account records, messages, documents, storage and providers, and explains the outcome. Some records may need to be retained for legal, accounting, fraud prevention or disputes. Support must explain retained categories, reasons and applicable retention, including backup expiry. Never provide your password or banking credentials.</p>`,
  ],
};
