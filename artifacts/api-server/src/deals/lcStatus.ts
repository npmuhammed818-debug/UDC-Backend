// Letter-of-credit status tracking ONLY (owner approval, 28 Oct): honest status
// text for the customer, from records a UDC human has confirmed. No bank or
// payment integration, no live money movement, no dates and no amounts in the
// wording - UDC confirms specifics in the chat.
export type LcStage = 'awaiting_lc' | 'lc_confirmed' | 'payment_in_progress' | 'payment_recorded' | 'deal_completed';

export function lcStage(dealStatus: string, hasConfirmedLc: boolean): LcStage {
  if (dealStatus === 'completed') return 'deal_completed';
  if (dealStatus === 'commission') return 'payment_recorded';
  if (dealStatus === 'payment') return 'payment_in_progress';
  return hasConfirmedLc ? 'lc_confirmed' : 'awaiting_lc';
}

export function lcStatusText(stage: LcStage): string {
  switch (stage) {
    case 'awaiting_lc':
      return 'The letter of credit is not in place yet. The seller does not ship until it is confirmed.';
    case 'lc_confirmed':
      return 'The letter of credit is confirmed. Next: inspection and shipping documents.';
    case 'payment_in_progress':
      return 'Payment is being checked against the inspection and documents.';
    case 'payment_recorded':
      return 'Payment is recorded. Commission and completion come next.';
    case 'deal_completed':
      return 'This deal is complete.';
  }
}

export function lcStatusReply(dealNumber: string, dealStatus: string, hasConfirmedLc: boolean): string {
  return `${dealNumber}: ${lcStatusText(lcStage(dealStatus, hasConfirmedLc))} UDC confirms exact dates and amounts in this chat.`;
}
