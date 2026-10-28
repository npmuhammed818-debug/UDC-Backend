// Plain-words access to the menu: "my deals", "upload my tax id", "track my
// order" run the exact same actions as the menu buttons and list rows, so
// people never have to tap. Matching is anchored to the whole message and
// conservative - ordinary chat and real questions still go to Akif's brain.
// Every returned value is an action id the menu dispatch already owns; role
// rules, verification gates and privacy wording stay in that dispatch.

// Upload intents first: an action verb plus a document. A named document sends
// that one private link; a general ask sends one link for every missing
// document. Role filtering happens in the dispatch (a buyer naming a seller
// document is told there is nothing to upload, never given a wrong link).
const UPLOAD_VERB = /(?:upload|send|submit|share|give)\b/;
const NAMED_DOCUMENTS: [RegExp, string][] = [
  [/(?:company\s+registration|trade\s+licen[cs]e|registration\s+certificate)/, 'doc:upload:company_registration'],
  [/(?:tax\s+id|gst|vat|tax\s+registration)/, 'doc:upload:tax_id'],
  [/import\s+licen[cs]e/, 'doc:upload:import_licence'],
  [/(?:export\s+licen[cs]e|exporter\s+id)/, 'doc:upload:export_licence'],
  [/product\s+licen[cs]e/, 'doc:upload:product_licence'],
  [/(?:past\s+exports?|export\s+invoices?|factory\s+photos?)/, 'doc:upload:past_exports'],
];

const TRACKING_NUMBER = /^(?:track|tracking)\s+(?:(?:my|the)\s+)?(?:(?:shipment|order|cargo|package|parcel|number)\s+)?([a-z0-9][a-z0-9-]{4,38}[a-z0-9])$/i;

const SPOKEN: [RegExp, string][] = [
  // deals
  [/^(?:my\s+)?deals$/, 'deals'],
  [/^assigned deals$/, 'deals'],
  [/^(?:show|open|see|view|check|list)(?:\s+me)?\s+my\s+deals$/, 'deals'],
  // requirement (buyer)
  [/^(?:new|add|post|submit|create|make)\s+(?:a\s+)?(?:buying\s+)?requirement$/, 'requirement'],
  [/^buy\s+products$/, 'requirement'],
  [/^(?:i\s+)?(?:want|wanna|would\s+like|need)(?:\s+to)?\s+buy\b/, 'requirement'],
  // offer (seller)
  [/^(?:new|add|post|submit|create|make)\s+(?:an?\s+)?(?:product\s+)?offer$/, 'offer'],
  [/^(?:add|post|list)\s+(?:a\s+|my\s+)?products?$/, 'offer'],
  [/^(?:i\s+)?(?:want|wanna|would\s+like|need)(?:\s+to)?\s+sell\b/, 'offer'],
  // meeting
  [/^(?:request|arrange|book|schedule|set\s*up)\s+(?:a\s+)?(?:video\s+|in[- ]person\s+)?meeting$/, 'meeting'],
  // profile
  [/^(?:my\s+)?profile$/, 'profile'],
  [/^my\s+(?:saved\s+)?details$/, 'profile'],
  [/^(?:show|view|see)\s+(?:my\s+)?profile$/, 'profile'],
  [/^(?:edit|update)\s+(?:my\s+)?(?:profile|details)$/, 'edit_profile'],
  // role
  [/^(?:change|switch)\s+(?:my\s+)?role$/, 'change_role'],
  // verification status
  [/^verification(\s+status)?$/, 'verification'],
  [/^(?:my|account)\s+status$/, 'verification'],
  [/^am\s+i\s+verified$/, 'verification'],
  // tracking
  [/^(?:track|tracking)(?:\s+my)?(?:\s+(?:shipment|order|cargo))?$/, 'track'],
  [/^(?:shipment|order)\s+status$/, 'track'],
  [/^where\s+(?:is|'?s)\s+my\s+(?:shipment|order|cargo)$/, 'track'],
  // documents overview (status list); upload intents are matched before this
  [/^(?:my\s+)?documents?$/, 'documents'],
  [/^documents?\s+status$/, 'documents'],
  [/^(?:show|see|view|check)\s+(?:my\s+)?documents?$/, 'documents'],
  [/^(?:document|documents)\s+list$/, 'documents'],
  // agent: invite code, referrals, commissions
  [/^my\s+(?:invite|invite\s+link|invitation|referral\s+link)$/, 'invite'],
  [/^invite\s+link$/, 'invite'],
  [/^(?:my\s+)?referrals$/, 'referrals'],
  [/^track\s+referrals$/, 'referrals'],
  [/^who\s+joined$/, 'referrals'],
  [/^(?:my\s+)?commissions?$/, 'commissions'],
  [/^commission\s+status$/, 'commissions'],
  [/^my\s+earnings?$/, 'commissions'],
  // ask Akif
  [/^ask\s+(?:akif|a\s+question)$/, 'ask'],
];

export function plainWordsAction(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const n = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n || n.length > 160) return null;
  if (/^deal\s+udc-/i.test(n)) return null; // deal references stay with the deal handlers
  const t = n.replace(/[.!?\s]+$/, '');
  if (!t) return null;
  // A named document with an upload verb sends that document's private link.
  if (UPLOAD_VERB.test(t)) {
    for (const [pattern, action] of NAMED_DOCUMENTS) {
      if (pattern.test(t)) return action;
    }
    // General upload ask: one link for every missing document.
    if (/\b(?:docs?|documents?|licen[cs]es?|certificates?|papers|paperwork|files?)\b/.test(t)) return 'doc:upload:all';
    if (/^(?:i\s+)?(?:want|wanna|would\s+like|need)(?:\s+to)?\s+upload\b/.test(t)) return 'doc:upload:all';
  }
  if (/^(?:how\s+)?(?:do\s+i|can\s+i|to)\s+(?:upload|send)\s+(?:my\s+)?(?:docs?|documents?|files?)\b/.test(t)) return 'doc:upload:all';
  if (/^(?:upload|send)\s+(?:me\s+)?(?:the\s+|a\s+)?link$/.test(t)) return 'doc:upload:all';
  for (const [pattern, action] of SPOKEN) {
    if (pattern.test(t)) return action;
  }
  // A carrier tracking number after "track" goes to the live lookup, not the
  // menu action. Exact menu phrases won above, so "track my shipment" and
  // "track referrals" keep their meaning; a digit is required so ordinary
  // words ("track orders") still fall through to Akif's brain.
  const trackingNumber = TRACKING_NUMBER.exec(t);
  if (trackingNumber && /\d/.test(trackingNumber[1])) return 'tracknum:' + trackingNumber[1].toUpperCase();
  return null;
}
