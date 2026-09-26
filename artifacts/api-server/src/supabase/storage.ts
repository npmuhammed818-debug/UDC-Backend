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
