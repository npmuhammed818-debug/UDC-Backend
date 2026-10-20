export function participantConversation<T extends { userId: string; originalText: string; relayed: boolean; relayText: string | null }>(events: T[], userId: string): T[] {
  return events.flatMap(event => event.userId === userId ? [event]
    : event.relayed && event.relayText?.trim() ? [{ ...event, originalText: event.relayText }] : []);
}

export function containsContactDetails(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /\+\d[\d ().-]{7,}\d|\b\d{10,15}\b/.test(text);
}

function numericValues(text: string) {
  return (text.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) ?? [])
    .map(value => Number(value.replaceAll(',', ''))).filter(Number.isFinite);
}

export function violatesPrivateRelay(text: string, privateContext: string[], explicitMessage = "") {
  if (containsContactDetails(text)) return true;
  const protectedValues = new Set(privateContext.flatMap(message => {
    const privateParts = message.split(/[!?;\n]+|\bbut\b/i)
      .filter(part => /\b(?:private|confidential|ceiling|margin|profit|maximum|my (?:limit|minimum)|minimum (?:price|acceptable)|floor)\b|don['’]?t (?:share|tell|disclose)/i.test(part));
    return privateParts.flatMap(numericValues);
  }));
  // A new, exact instruction may explicitly turn a previously private value into
  // an offered price. Ambiguous or conditional messages cannot grant that release.
  const explicitOffer = /^(?:please\s+)?(?:offer|quote|counter(?:offer)?(?: at)?|propose)\s+(?:(?:USD|\$)\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:\s*USD)?(?:\s*(?:per|\/)\s*(?:MT|tonne))?[.!]?$/i.test(explicitMessage.trim());
  if (explicitOffer) for (const value of numericValues(explicitMessage)) protectedValues.delete(value);
  return numericValues(text).some(value => protectedValues.has(value));
}
