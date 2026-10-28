// DECIDED (Master Plan v3, section 6): contact details are shared only after
// the SPA is signed and UDC approves. Deal stages move only by UDC's own ops,
// so reaching the contract stage means both. Before that, AKIF relays messages
// and never hands over phone numbers, emails or names of the counterparty.

// Stage order mirrors the recorded deal pipeline. Unknown stages fail closed.
const STAGE_ORDER = [
  'initiated', 'negotiation', 'verification', 'loi', 'icpo', 'fco_sco',
  'contract', // SPA signed; UDC moved the deal here itself = its approval
  'banking', 'inspection', 'loading', 'shipment', 'delivery', 'payment', 'commission',
] as const;

export function contactsUnlocked(dealStatus: string | null | undefined): boolean {
  const index = STAGE_ORDER.indexOf((dealStatus ?? '').trim() as (typeof STAGE_ORDER)[number]);
  return index >= STAGE_ORDER.indexOf('contract');
}

export const CONTACTS_LOCKED_REPLY =
  'Contact details are shared only after the SPA is signed and UDC approves the exchange. Until then, send me the message and I will relay it to the other party.';

export type CounterpartyContact = {
  fullName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
};

export function contactShareReply(counterpartRole: string, contact: CounterpartyContact): string {
  const lines = [
    `${counterpartRole === 'seller' ? 'Seller' : 'Buyer'} contact (shared after SPA signing, with UDC approval):`,
  ];
  if (contact.fullName) lines.push(`Name: ${contact.fullName}`);
  if (contact.companyName) lines.push(`Company: ${contact.companyName}`);
  if (contact.email) lines.push(`Email: ${contact.email}`);
  if (contact.phone) lines.push(`Phone: ${contact.phone}`);
  if (lines.length === 1) lines.push('No contact details are recorded yet. UDC will share them once recorded.');
  lines.push('Keep UDC in the loop on this deal - that is what protects your payment and goods.');
  return lines.join('\n');
}
