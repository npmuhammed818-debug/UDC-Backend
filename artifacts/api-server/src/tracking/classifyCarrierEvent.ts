/** Conservative description-only classification. Negated/uncertain outcomes
 * cannot establish shipment or delivery. Carrier text remains unverified. */
export function classifyCarrierDescription(description:string):'shipped'|'delayed'|'delivered'|null{
 const text=description.toLowerCase();
 // Intermediate logistics handoffs do not establish delivery to the recipient.
 if(/\bdelivered\b[^.\n]{0,80}\b(?:carrier|delivery partner|sorting hub|sorting cent(?:er|re)|customs office|parcel locker|onward transport)\b/.test(text))return null;
 if(/\bif\s+(?:it\s+(?:is|was)\s+)?delivered\b/.test(text))return null;
 // Return legs and intermediate handoffs do not establish consignee delivery.
 if(/\b(?:return(?:ed|ing)?(?: to|ed)?|back to)\b[^.\n]{0,50}\b(?:sender|shipper|origin)\b|\bdelivered\b[^.\n]{0,60}\b(?:sender|shipper|pickup point|pick-up point|collection point|post office|available for collection)\b/.test(text))return null;
 if(/\bproof of delivery\b/.test(text)&&!/\bdelivered\b/.test(text))return null;

 // Plans, questions and requests cannot establish an accomplished carrier event.
 if(/\?|\b(?:will|would|should|may|might|could|please|tomorrow|requested|requesting|ready to|ready for|waiting for|due to)\b/.test(text))return null;
 if(/\b(?:not|never|no|without|unable|cannot|can't|could not|couldn't|yet to|awaiting|pending|expected|estimated|scheduled|out for)\b[^.\n]{0,45}\b(?:deliver\w*|proof of delivery|ship\w*|depart\w*|dispatch\w*|in transit|picked up|left)\b|\b(?:deliver\w*|proof of delivery|ship\w*|depart\w*|dispatch\w*|in transit|picked up|left)\b[^.\n]{0,30}\b(?:not|pending|unavailable|unconfirmed|expected|scheduled|failed|unsuccessful)\b/.test(text))return null;
 if(/\b(?:no|not|without|resolved|cleared)\b[^.\n]{0,25}\b(?:delay\w*|exception|hold|held)\b|\b(?:delay\w*|exception|hold)\b[^.\n]{0,25}\b(?:resolved|cleared)\b/.test(text))return null;
 if(/\bdelay|exception|held\b|customs hold|failed attempt/.test(text))return 'delayed';
 if(/\bdelivered\b/.test(text))return 'delivered';
 if(/\bshipped\b|departed|dispatched|in transit|picked up|origin scan|\bleft\b(?:\s+from)?\s+(?:the\s+)?(?:origin|port|facility|warehouse|depot|terminal)\b/.test(text))return 'shipped';
 return null;
}
