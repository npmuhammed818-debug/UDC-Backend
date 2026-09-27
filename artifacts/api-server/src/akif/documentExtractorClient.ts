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
  // Copy into an ArrayBuffer-backed view before constructing a Blob. Incoming
  // Node buffers may be backed by SharedArrayBuffer, which is not a valid
  // BlobPart in the current TypeScript DOM definitions.
  const blobBytes = new Uint8Array(input.bytes.byteLength);
  blobBytes.set(input.bytes);

  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const body = new FormData();
    body.set(
      "file",
      new Blob([blobBytes.buffer], { type: input.mimeType }),
      input.fileName,
    );

    try {
      const response = await fetch(`${baseUrl}/extract`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body,
        signal: AbortSignal.timeout(60_000),
      });

      if (response.ok) {
        return await response.json() as DocumentExtractionResult;
      }

      lastStatus = response.status;
      await response.body?.cancel();
      if (![502, 503, 504].includes(response.status) || attempt === 2) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
  }

  throw new Error(`document_extractor_failed http=${lastStatus ?? "network"}`);
}
