type Check = {
  name: string;
  url: string;
  expectedStatus?: number;
  method?: string;
};

export {};

const checks: Check[] = [
  {
    name: "UDC backend",
    url: `${(process.env.UDC_BACKEND_URL ?? "https://udc-backend.onrender.com").replace(/\/$/, "")}/api/health`,
  },
  {
    name: "database connection",
    url: `${(process.env.UDC_BACKEND_URL ?? "https://udc-backend.onrender.com").replace(/\/$/, "")}/api/db/healthz`,
  },
  {
    name: "admin tools reject anonymous access",
    url: `${(process.env.UDC_BACKEND_URL ?? "https://udc-backend.onrender.com").replace(/\/$/, "")}/api/admin/akif/intelligence/capabilities`,
    expectedStatus: 401,
  },
  {
    name: "legacy intake rejects anonymous writes",
    url: `${(process.env.UDC_BACKEND_URL ?? "https://udc-backend.onrender.com").replace(/\/$/, "")}/api/whatsapp/buyer-intake`,
    expectedStatus: 401,
    method: "POST",
  },
  {
    name: "document extractor",
    url: `${(process.env.UDC_DOCUMENT_EXTRACTOR_URL ?? "https://udc-document-extractor.onrender.com").replace(/\/$/, "")}/health`,
  },
  {
    name: "AKIF worker",
    url: `${(process.env.AKIF_WORKER_URL ?? "https://udc-akif-worker.onrender.com").replace(/\/$/, "")}/health`,
  },
];

async function checkService(check: Check) {
  const response = await fetch(check.url, { method: check.method ?? "GET", signal: AbortSignal.timeout(90_000) });
  if (response.status !== (check.expectedStatus ?? 200)) {
    throw new Error(`${check.name} returned HTTP ${response.status}`);
  }
  await response.body?.cancel();
  console.log(`OK ${check.name}`);
}

const results = await Promise.allSettled(checks.map(checkService));
const failures = results.filter((result) => result.status === "rejected");

if (failures.length) {
  for (const failure of failures) {
    console.error(failure.reason instanceof Error ? failure.reason.message : "unknown smoke-check failure");
  }
  process.exitCode = 1;
}
