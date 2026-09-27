type Check = {
  name: string;
  url: string;
};

export {};

const checks: Check[] = [
  {
    name: "UDC backend",
    url: `${(process.env.UDC_BACKEND_URL ?? "https://udc-backend.onrender.com").replace(/\/$/, "")}/api/health`,
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
  const response = await fetch(check.url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
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
