import { eq } from "drizzle-orm";
import {
  db,
  dealIntelligenceSnapshotsTable,
  documentExtractionsTable,
} from "@workspace/db";
import { extractDocumentBytes } from "./documentExtractorClient";
import { getAkifDealContext } from "./intelligence/dealContext";
import { runHermesChat, runHermesMultimodal } from "./intelligence/hermesClient";

function cleanJson(raw: string) {
  const value = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? value.slice(start, end + 1) : null;
}

const extractionSchemaDescription = {
  documentType: "LOI, ICPO, FCO, SCO, SPA, NCNDA, SGS, BL, COA, CO, invoice, packing_list, banking, other",
  documentNumber: "string or null",
  dates: {
    issueDate: "string or null",
    expiryDate: "string or null",
    validity: "string or null",
    otherDates: "array",
  },
  parties: "array of {name, role, company, address, country, registrationNumber, taxId, contact, bank}",
  product: {
    name: "string or null",
    grade: "string or null",
    hsCode: "string or null",
    specifications: "object",
  },
  quantity: "{value, unit, schedule, tolerance}",
  pricing: "{unitPrice, currency, totalValue, basis, commissions, fees}",
  logistics: "{incoterm, origin, loadingPort, destination, destinationPort, shipmentSchedule, packing, carrier}",
  payment: "{instrument, terms, timing, bank, transferable, irrevocable, divisible, assignable, swiftOrMtReferences}",
  performanceBond: "{percentage, amount, currency, terms}",
  inspection: "{agency, location, timing, standard, requirements}",
  documentsRequired: "array of document names/conditions",
  obligations: "array of {party, obligation, deadline, condition}",
  conditionsPrecedent: "array",
  warrantiesOrGuarantees: "array",
  penaltiesOrRemedies: "array",
  legal: "{governingLaw, jurisdiction, arbitration, forceMajeure}",
  references: "array of IDs, contract refs, bank refs and shipment refs",
  discrepanciesOrConflicts: "array of facts in this document that may conflict with known deal terms",
  otherTerms: "array of material terms not captured above",
  confidence: "number from 0 to 1",
};

async function extractChunkFacts(input: {
  chunk: string;
  chunkIndex: number;
  totalChunks: number;
  documentType: string;
  knownDeal: Record<string, unknown>;
}) {
  const system = [
    "You are AKIF's trade-document extraction engine.",
    "Extract facts only from the supplied document text.",
    "Never approve, verify authenticity, or invent missing values.",
    "Keep exact commercial numbers, currencies, quantities, dates and payment wording when present.",
    "If a term conflicts with the known deal, record it in discrepanciesOrConflicts rather than silently replacing either value.",
    "Return one JSON object only, with no markdown.",
  ].join(" ");

  const prompt = JSON.stringify({
    task: "Extract all material trade facts from this document chunk.",
    chunkIndex: input.chunkIndex,
    totalChunks: input.totalChunks,
    declaredDocumentType: input.documentType,
    knownDeal: input.knownDeal,
    requiredShape: extractionSchemaDescription,
    documentText: input.chunk,
  });

  const { content } = await runHermesChat(prompt, system, 60_000);
  const json = cleanJson(content);
  if (!json) throw new Error("document_ai_invalid_json");
  return JSON.parse(json) as Record<string, unknown>;
}

async function mergeChunkFacts(
  parts: Record<string, unknown>[],
  documentType: string,
  knownDeal: Record<string, unknown>,
) {
  if (parts.length === 1) return parts[0]!;

  const system = [
    "You merge partial extractions from one trade document.",
    "Preserve every material fact from all chunks and remove only exact duplicates.",
    "Never invent values and never decide authenticity.",
    "Preserve conflicts explicitly.",
    "Return one JSON object only with no markdown.",
  ].join(" ");

  const prompt = JSON.stringify({
    task: "Merge all chunk extractions into one complete document extraction.",
    declaredDocumentType: documentType,
    knownDeal,
    requiredShape: extractionSchemaDescription,
    partialExtractions: parts,
  });

  const { content } = await runHermesChat(prompt, system, 60_000);
  const json = cleanJson(content);
  if (!json) throw new Error("document_ai_merge_invalid_json");
  return JSON.parse(json) as Record<string, unknown>;
}

async function transcribeVisionPage(input: {
  pageNumber: number;
  mimeType: string;
  base64: string;
}) {
  const system = [
    "You are AKIF's document transcription engine.",
    "Transcribe every legible word, number, table cell, stamp label and commercial term visible on the page.",
    "Do not summarize and do not invent unreadable text.",
    "Preserve line breaks and table-like structure where possible.",
    "Return transcription text only.",
  ].join(" ");

  const { content } = await runHermesMultimodal(
    [
      {
        type: "text",
        text: `Transcribe page ${input.pageNumber} completely. If any portion is unreadable, write [UNREADABLE] in that location.`,
      },
      {
        type: "image_url",
        image_url: {
          url: `data:${input.mimeType};base64,${input.base64}`,
        },
      },
    ],
    system,
    60_000,
  );

  return content.trim();
}

async function applyVisionFallback(
  baseText: string,
  pages: Array<{ page_number: number; mime_type: string; base64: string }>,
) {
  if (!pages.length) {
    return { text: baseText, warnings: [] as string[] };
  }

  const warnings: string[] = [];
  const additions: string[] = [];

  for (const page of pages) {
    try {
      const transcription = await transcribeVisionPage({
        pageNumber: page.page_number,
        mimeType: page.mime_type,
        base64: page.base64,
      });
      additions.push(`\n--- VISION TRANSCRIPTION PAGE ${page.page_number} ---\n${transcription}`);
    } catch {
      warnings.push(`vision_page_${page.page_number}_failed`);
    }
  }

  return {
    text: [baseText, ...additions].filter(Boolean).join("\n").trim(),
    warnings,
  };
}

async function structureTradeDocument(input: {
  text: string;
  documentType: string;
  knownDeal: Record<string, unknown>;
}) {
  const chunkSize = 50_000;
  const chunks: string[] = [];
  for (let offset = 0; offset < input.text.length; offset += chunkSize) {
    chunks.push(input.text.slice(offset, offset + chunkSize));
  }

  const warnings: string[] = [];
  const maxStructuredChunks = 24;
  const chunksForStructuring = chunks.slice(0, maxStructuredChunks);
  if (chunks.length > maxStructuredChunks) {
    warnings.push("structured_analysis_truncated_after_24_chunks");
  }

  const partials: Record<string, unknown>[] = [];
  for (let index = 0; index < chunksForStructuring.length; index += 1) {
    partials.push(await extractChunkFacts({
      chunk: chunksForStructuring[index]!,
      chunkIndex: index + 1,
      totalChunks: chunks.length,
      documentType: input.documentType,
      knownDeal: input.knownDeal,
    }));
  }

  const structured = partials.length
    ? await mergeChunkFacts(partials, input.documentType, input.knownDeal)
    : {
        documentType: input.documentType,
        discrepanciesOrConflicts: [],
        otherTerms: [],
        confidence: 0,
      };

  return { structured, warnings };
}

function snapshotSafeContext(context: NonNullable<Awaited<ReturnType<typeof getAkifDealContext>>>) {
  return {
    ...context,
    documentExtractions: context.documentExtractions.map((extraction) => ({
      id: extraction.id,
      documentId: extraction.documentId,
      dealId: extraction.dealId,
      status: extraction.status,
      extractor: extraction.extractor,
      mimeType: extraction.mimeType,
      fileName: extraction.fileName,
      pageCount: extraction.pageCount,
      structuredData: extraction.structuredData,
      warnings: extraction.warnings,
      confidence: extraction.confidence,
      errorCode: extraction.errorCode,
      rawTextStored: Boolean(extraction.fullText),
      rawTextLength: extraction.fullText?.length ?? 0,
      createdAt: extraction.createdAt,
      updatedAt: extraction.updatedAt,
    })),
  };
}

export async function refreshDealIntelligenceSnapshot(dealId: string) {
  const context = await getAkifDealContext(dealId);
  if (!context) throw new Error("deal_not_found");

  const snapshot = snapshotSafeContext(context);
  await db.insert(dealIntelligenceSnapshotsTable)
    .values({
      dealId,
      snapshot,
      documentCount: context.documents.length,
      extractionCount: context.documentExtractions.filter((item) => item.status === "completed" || item.status === "needs_review").length,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: dealIntelligenceSnapshotsTable.dealId,
      set: {
        snapshot,
        documentCount: context.documents.length,
        extractionCount: context.documentExtractions.filter((item) => item.status === "completed" || item.status === "needs_review").length,
        updatedAt: new Date(),
      },
    });

  return snapshot;
}

export async function processDocumentIntelligence(input: {
  documentId: string;
  dealId: string;
  documentType: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}) {
  await db.insert(documentExtractionsTable)
    .values({
      documentId: input.documentId,
      dealId: input.dealId,
      status: "processing",
      extractor: "udc-open-source+qwen",
      mimeType: input.mimeType,
      fileName: input.fileName,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: documentExtractionsTable.documentId,
      set: {
        status: "processing",
        extractor: "udc-open-source+qwen",
        mimeType: input.mimeType,
        fileName: input.fileName,
        errorCode: null,
        updatedAt: new Date(),
      },
    });

  try {
    const extraction = await extractDocumentBytes({
      bytes: input.bytes,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });

    const currentContext = await getAkifDealContext(input.dealId);
    if (!currentContext) throw new Error("deal_not_found");

    const knownDeal = {
      deal: currentContext.deal,
      product: currentContext.product,
      buyerRequest: currentContext.buyerRequest,
      sellerListing: currentContext.sellerListing,
    };

    const vision = await applyVisionFallback(
      extraction.text,
      extraction.vision_pages ?? [],
    );

    const { structured, warnings: aiWarnings } = await structureTradeDocument({
      text: vision.text,
      documentType: input.documentType,
      knownDeal,
    });

    const warnings = [...new Set([
      ...(extraction.warnings ?? []),
      ...vision.warnings,
      ...aiWarnings,
    ])];
    const status = warnings.some((warning) =>
      warning.includes("_failed")
      || warning === "vision_fallback_limited_to_20_pages"
      || warning === "structured_analysis_truncated_after_24_chunks"
    )
      ? "needs_review"
      : "completed";
    const rawConfidence = structured["confidence"];
    const confidence = typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? String(Math.max(0, Math.min(1, rawConfidence)))
      : null;

    await db.update(documentExtractionsTable)
      .set({
        status,
        extractor: `${extraction.extraction_method}+qwen`,
        pageCount: extraction.page_count ?? null,
        fullText: vision.text,
        structuredData: structured,
        warnings,
        confidence,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(documentExtractionsTable.documentId, input.documentId));

    await refreshDealIntelligenceSnapshot(input.dealId);
    return { status, structured, warnings, textLength: vision.text.length };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 160) : "document_intelligence_failed";
    await db.update(documentExtractionsTable)
      .set({
        status: "failed",
        errorCode,
        updatedAt: new Date(),
      })
      .where(eq(documentExtractionsTable.documentId, input.documentId));

    await refreshDealIntelligenceSnapshot(input.dealId).catch(() => undefined);
    throw error;
  }
}
