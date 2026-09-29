import assert from "node:assert/strict";
import test from "node:test";
import { missingPaymentEvidence, paymentMilestoneStages } from "../src/deals/paymentMilestone.ts";

test("payment and completion need all recorded evidence and human destination confirmation", () => {
  assert.deepEqual([...paymentMilestoneStages], ["payment", "commission", "completed"]);
  assert.deepEqual(missingPaymentEvidence({ confirmedDestinationSgs: false }), [
    "confirmed_dlc_required", "passed_inspection_required", "approved_sgs_document_required", "destination_sgs_confirmation_required",
  ]);
  assert.deepEqual(missingPaymentEvidence({
    confirmedDestinationSgs: true, confirmedDlcId: "dlc", passedInspectionId: "inspection", approvedSgsDocumentId: "document",
  }), []);
  assert.deepEqual(missingPaymentEvidence({
    confirmedDestinationSgs: true, confirmedDlcId: "dlc", approvedSgsDocumentId: "document",
  }), ["passed_inspection_required"]);
});
