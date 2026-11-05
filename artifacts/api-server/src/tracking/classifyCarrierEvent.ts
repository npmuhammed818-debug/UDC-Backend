/** Conservative description-only classification. Negated/uncertain outcomes
 * cannot establish shipment or delivery. Carrier text remains unverified. */
export function classifyCarrierDescription(description:string):'shipped'|'delayed'|'delivered'|null{
 const text=description.toLowerCase();
 if(/\b(?:not|never|no|without|unable|cannot|can't|could not|couldn't|yet to|awaiting|pending|expected|estimated|scheduled|out for)\b[^.\n]{0,45}\b(?:deliver\w*|proof of delivery|ship\w*|depart\w*|dispatch\w*)\b|\b(?:deliver\w*|proof of delivery|ship\w*)\b[^.\n]{0,30}\b(?:not|pending|unavailable|unconfirmed|expected|scheduled)\b/.test(text))return null;
 if(/\bdelay|exception|held\b|customs hold|failed attempt/.test(text))return 'delayed';
 if(/\bdelivered\b|proof of delivery/.test(text))return 'delivered';
 if(/\bshipped\b|departed|dispatched|in transit|picked up|origin scan|\bleft\b/.test(text))return 'shipped';
 return null;
}
