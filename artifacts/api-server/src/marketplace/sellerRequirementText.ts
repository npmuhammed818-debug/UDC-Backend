// Pure wording and matching rules for seller requirement notifications. No I/O.
export const MAX_SELLERS_PER_REQUIREMENT = 10;

export function formatQuantity(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Requirement only: product, quantity, destination, incoterm. Never buyer identity.
export function requirementNotifyText(
  request: { quantity: unknown; unit: string; destination?: string | null; preferredIncoterm?: string | null },
  productName: string,
): string {
  let text = `A buyer wants ${productName}: ${formatQuantity(request.quantity)} ${request.unit}`;
  if (request.destination) text += ` to ${request.destination}`;
  if (request.preferredIncoterm) text += `, ${request.preferredIncoterm}`;
  return text + '. Interested?';
}

export function asksForOpenRequirements(text: string | null | undefined): boolean {
  return typeof text === 'string'
    && (/\bany buyers\b/i.test(text) || /\bbuyers? for my\b/i.test(text) || /\bopen requirements?\b/i.test(text));
}

export const REQUIREMENT_INTEREST_RECORDED = 'Noted. UDC reviews this match and will message you here. Your documents must be verified before a deal starts.';
export const REQUIREMENT_INTEREST_REPEAT = 'You already showed interest in this requirement. UDC will message you here.';
export const REQUIREMENT_INTEREST_UNAVAILABLE = 'That requirement is not available for this number.';
export const REQUIREMENT_PASS_REPLY = 'No problem. I will keep telling you about new matching requirements.';
export function openRequirementsReply(count: number): string {
  if (count <= 0) return 'No open buyer requirements for your products right now. I will message you when one appears.';
  return `${count} open buyer requirement${count === 1 ? ' matches' : 's match'} your products right now. UDC reviews each one and messages you here when there is a match.`;
}

