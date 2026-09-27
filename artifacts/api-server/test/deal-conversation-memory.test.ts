import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationSafeDealMemory } from "../src/akif/dealConversationMemory.ts";

test("conversation memory removes old cross-deal chat and internal extraction errors", () => {
  const snapshot = {
    deal: { id: "deal-1", status: "negotiation" },
    product: { name: "Copper Scrap" },
    buyerRequest: { productName: "Copper Scrap" },
    sellerListing: { productName: "Copper Scrap" },
    documents: [
      { id: "doc-1", documentType: "FCO", status: "pending", fileUrl: "storage://secret/fco.pdf" },
      { id: "doc-2", documentType: "LOI", status: "pending", fileUrl: "storage://secret/loi.pdf" },
    ],
    documentExtractions: [
      {
        documentId: "doc-1",
        status: "failed",
        errorCode: "extractor_http_502",
        warnings: ["upstream error"],
        structuredData: null,
      },
      {
        documentId: "doc-2",
        status: "completed",
        errorCode: null,
        warnings: [],
        structuredData: { payment: { instrument: "DLC" } },
        confidence: "0.9",
      },
    ],
    conversation: [
      { originalText: "I need 20 MT frozen chicken to Dubai" },
    ],
    history: [
      { message: "new frozen chicken request" },
    ],
  };

  const safe = conversationSafeDealMemory(snapshot);
  const text = JSON.stringify(safe);

  assert.match(text, /Copper Scrap/);
  assert.match(text, /"instrument":"DLC"/);
  assert.doesNotMatch(text, /frozen chicken/i);
  assert.doesNotMatch(text, /502|extractor_http|upstream error/i);
  assert.doesNotMatch(text, /storage:\/\//i);
});

test("conversation memory keeps only completed or reviewable extraction facts", () => {
  const safe = conversationSafeDealMemory({
    documentExtractions: [
      { documentId: "a", status: "processing", structuredData: { bad: true } },
      { documentId: "b", status: "failed", structuredData: { bad: true } },
      { documentId: "c", status: "needs_review", structuredData: { useful: true } },
      { documentId: "d", status: "completed", structuredData: { useful2: true } },
    ],
  });

  const text = JSON.stringify(safe);
  assert.doesNotMatch(text, /"bad":true/);
  assert.match(text, /"useful":true/);
  assert.match(text, /"useful2":true/);
});
