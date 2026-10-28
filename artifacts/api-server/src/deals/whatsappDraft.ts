import { createHash } from "node:crypto";
import { createLoiDraft } from "./loiDraft.ts";
import { createIcpoDraft } from "./icpoDraft.ts";
import { createFcoDraft } from "./fcoDraft.ts";
import { createSpaDraft, type SpaDraftInput } from "./spaDraft.ts";
import { createNcndaDraft } from "./ncndaDraft.ts";
import { createSellerContractDraft } from "./sellerContractDraft.ts";
import { createAgentAgreementDraft } from "./agentAgreementDraft.ts";
import { buildDraftModel } from "./draftModel.ts";
import { renderDraftPdf } from "./draftPdf.ts";

const generators = { LOI: createLoiDraft, ICPO: createIcpoDraft, FCO: createFcoDraft, SPA: createSpaDraft, NCNDA: createNcndaDraft, SELLER_CONTRACT: createSellerContractDraft, AGENT_AGREEMENT: createAgentAgreementDraft };
export type WhatsAppDraftType = keyof typeof generators;

export function requestedWhatsAppDraft(text: string) {
  // Only explicit commands create drafts; mentions, questions and quoted terms do not.
  const normalized = text.trim().replace(/[.!]+$/, "").trim();
  const confirmation = normalized.match(/^confirm draft (LOI|ICPO|FCO|SPA|NCNDA|SELLER_CONTRACT|AGENT[ _]AGREEMENT)$/i);
  const request = normalized.match(/^(?:please\s+)?(?:create|generate|prepare|make|draft)\s+(?:an?\s+)?(LOI|ICPO|FCO|SPA|NCNDA|SELLER_CONTRACT|AGENT[ _]AGREEMENT)(?:\s+draft)?(?:\s+(?:for me|please))?$/i);
  const match = confirmation ?? request;
  return match ? { type: match[1]!.toUpperCase().replace(' ', '_') as WhatsAppDraftType, confirmed: Boolean(confirmation) } : null;
}

export function mayPrepareWhatsAppDraft(type: WhatsAppDraftType, isBuyer: boolean) {
  // AGENT_AGREEMENT is additionally gated in the webhook: agents only, and only
  // after the SPA for the deal is signed (owner decision, 28 Oct).
  return type === "LOI" || type === "ICPO" ? isBuyer : type === "FCO" || type === "SELLER_CONTRACT" ? !isBuyer : true;
}

export function whatsappDraftConfirmation(type: WhatsAppDraftType, terms: SpaDraftInput) {
  // Bind confirmation to the exact terms shown, so a later price change cannot be
  // silently used for a draft authorized against an earlier preview.
  const hash = createHash("sha256").update(JSON.stringify({ ...terms, date: undefined })).digest("hex");
  return `draft_confirmation:${type}:${hash}`;
}

export function generateWhatsAppDraft(type: WhatsAppDraftType, terms: SpaDraftInput) {
  return generators[type](terms);
}

export async function generateWhatsAppDraftPdf(type: WhatsAppDraftType, terms: SpaDraftInput) {
  return renderDraftPdf(buildDraftModel(type, terms));
}
