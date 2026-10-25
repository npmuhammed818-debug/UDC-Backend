// Only these event classes may enter the outbound adapter. Never forward an
// in-app body, review note, file name/URL, bank field or trade terms to Meta.
const texts: Record<string, string> = {
  shipment_created: 'A shipment was recorded for your UDC deal.',
  shipment_status_updated: 'A shipment status was updated for your UDC deal.',
  shipment_milestone: 'A shipment milestone was recorded for your UDC deal.',
  shipment_delay: 'A shipment delay or exception was reported. UDC review is required.',
  cargo_unit_status_updated: 'A cargo status or estimated arrival was updated for your UDC deal.',
  shipment_eta_updated: 'An estimated arrival was updated. This is an estimate, not confirmation of arrival.',
  shipment_eta_followup: 'A recorded shipment estimate or report needs confirmation. This is not proof of delay or arrival.',
  document_reviewed: 'A document review status was updated for your UDC deal.',
  deal_issue_recorded: 'An issue was recorded for review on your UDC deal.',
  payment_status_updated: 'A financial instrument record was updated for your UDC deal. This is not authorization or confirmation of payment.',
  deal_created: 'A UDC deal was opened for you.',
  deal_status_updated: 'Your UDC deal stage was updated. Financial and verification actions remain subject to human review.',
  inspection_created: 'An inspection record was added to your UDC deal. This is not confirmation of inspection approval.',
  inspection_status_updated: 'An inspection record was updated for your UDC deal. Check the reviewed evidence.',
  customs_status_updated: 'A customs record was updated for your UDC deal.',
  deal_meeting_scheduled: 'A meeting was recorded for your UDC deal.',
  deal_case_opened: 'A case was opened for review on your UDC deal.',
};
export const GENERIC_NOTIFICATION_TEMPLATE_BODY = 'There is an update on your UDC deal. Open My deals in WhatsApp to review the details you are authorized to see.';
export function notificationText(type: string, role: string): string | null {
  if (/^deal_escalation:[a-z_]+:\d{4}-\d{2}-\d{2}$/.test(type)) {
    return ['buyer','seller'].includes(role) ? 'Your UDC deal needs an action review. Open My deals in WhatsApp.' : null;
  }
  if (!Object.hasOwn(texts, type) || !['buyer', 'seller', 'agent'].includes(role)) return null;
  if (role === 'agent') {
    if (!type.startsWith('shipment_') && type !== 'cargo_unit_status_updated') return null;
    return 'A shipment update was recorded for an assigned UDC deal. Open My deals → Track shipment. No arrival, inspection or payment approval is implied.';
  }
  return texts[type] + ' Open My deals in WhatsApp to review your authorized information.';
}
