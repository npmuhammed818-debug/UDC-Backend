export const paymentMilestoneStages = new Set(["payment", "commission", "completed"]);

export function missingPaymentEvidence(input: {
  confirmedDestinationSgs: boolean;
  confirmedDlcId?: string;
  passedInspectionId?: string;
  approvedSgsDocumentId?: string;
}): string[] {
  return [
    ...(!input.confirmedDlcId ? ["confirmed_dlc_required"] : []),
    ...(!input.passedInspectionId ? ["passed_inspection_required"] : []),
    ...(!input.approvedSgsDocumentId ? ["approved_sgs_document_required"] : []),
    ...(!input.confirmedDestinationSgs ? ["destination_sgs_confirmation_required"] : []),
  ];
}
