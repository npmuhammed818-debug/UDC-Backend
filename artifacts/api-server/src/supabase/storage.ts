const bucket = "udc-documents";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase_storage_not_configured");
  return { url: url.replace(/\/$/, ""), key };
}

export async function createSignedUploadUrl(path: string) {
  const { url, key } = config();
  const response = await fetch(`${url}/storage/v1/object/upload/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("signed_upload_url_failed");
  const result = await response.json() as { url: string };
  return `${url}/storage/v1${result.url}`;
}

export function storagePath(path: string) {
  return `storage://${bucket}/${path}`;
}

export async function createSignedDownloadUrl(path: string) {
  const { url, key } = config();
  const response = await fetch(`${url}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!response.ok) throw new Error("signed_download_url_failed");
  const result = await response.json() as { signedURL: string };
  return `${url}/storage/v1${result.signedURL}`;
}

export function parseStoragePath(value: string) {
  const prefix = `storage://${bucket}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}


export async function uploadDocumentBytes(
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const { url, key } = config();
  const response = await fetch(
    `${url}/storage/v1/object/${bucket}/${path}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        "content-type": contentType,
        "x-upsert": "false",
      },
      body: bytes,
    },
  );

  if (!response.ok) {
    throw new Error(`document_upload_failed http=${response.status}`);
  }

  await response.body?.cancel();
  return storagePath(path);
}
