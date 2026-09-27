export type DocumentExtractionResult = {
  text: string;
  page_count?: number | null;
  extraction_method: string;
  warnings: string[];
  metadata: Record<string, unknown>;
  vision_pages?: Array<{
    page_number: number;
    mime_type: string;
    base64: string;
  }>;
};

function config() {
  const rawUrl = process.env.UDC_DOCUMENT_EXTRACTOR_URL?.trim();
  const token = process.env.UDC_DOCUMENT_EXTRACTOR_TOKEN?.trim();
  if (!rawUrl || !token) throw new Error("document_extractor_not_configured");
  return { baseUrl: rawUrl.replace(/\/$/, ""), token };
}

export async function extractDocumentBytes(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}) {
  const { baseUrl, token } = config();
  const body = new FormData();
  // Copy into an ArrayBuffer-backed view before constructing a Blob. Incoming
  // Node buffers may be backed by SharedArrayBuffer, which is not a valid
  // BlobPart in the current TypeScript DOM definitions.
  const blobBytes = new Uint8Array(input.bytes.byteLength);
  blobBytes.set(input.bytes);
  body.set(
    "file",
    new Blob([blobBytes.buffer], { type: input.mimeType }),
    input.fileName,
  );

  const response = await fetch(`${baseUrl}/extract`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`document_extractor_failed http=${response.status}`);
  }

  return await response.json() as DocumentExtractionResult;
}
