export type DocumentExtractionResult = {
  text: string;
  page_count?: number | null;
  extraction_method: string;
  warnings: string[];
  metadata: Record<string, unknown>;
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
  body.set(
    "file",
    new Blob([input.bytes], { type: input.mimeType }),
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
