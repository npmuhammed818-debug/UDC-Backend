/**
 * Provider-neutral seam for a future official WhatsApp/Meta integration.
 *
 * This module intentionally has no transport, credentials, or mock sender.
 * UDC owns the verified trade record; an approved provider can later implement
 * these handoffs without changing the execution UI or domain models.
 */
export type CommunicationChannel = "whatsapp";

export type CommunicationIntent =
  | "counterparty_update"
  | "document_request"
  | "negotiation_follow_up";

export type CommunicationHandoff = {
  channel: CommunicationChannel;
  intent: CommunicationIntent;
  dealId: string;
};

export interface CommunicationProvider {
  readonly channel: CommunicationChannel;
  createHandoff(input: CommunicationHandoff): Promise<{
    externalReference: string;
  }>;
}

export const communicationBoundary = {
  channelLabel: "WhatsApp",
  channelDescription: "Fast counterparty communication",
  udcDescription:
    "UDC remains the source of truth for verification, negotiation records, documents, permissions, and trade milestones.",
} as const;