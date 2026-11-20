/** Customer email freeze (user, 15 Nov: zero messages to anyone except his own number; applied to email too).
 *  Fail closed: only the owner's own mailbox, or a plus alias of it, may receive email from UDC. This is the
 *  only place that decides, and every real transport calls it. There is deliberately no env switch to lift it. */
const OWN_MAILBOX = /^npmuhammed818(\+[a-z0-9._-]{1,40})?@gmail\.com$/;

export function emailRecipientAllowed(address: string | null | undefined): boolean {
  return OWN_MAILBOX.test(String(address ?? "").trim().toLowerCase());
}

/** Throws unless every recipient is the owner's own mailbox. */
export function assertEmailFreeze(to: string | string[] | null | undefined): void {
  const list = Array.isArray(to) ? to : [to];
  if (list.length === 0 || !list.every((a) => emailRecipientAllowed(a))) throw new Error("email_freeze_recipient_blocked");
}
