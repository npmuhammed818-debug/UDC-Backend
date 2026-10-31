import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeAkifProduct, runAkifReasoning, runAkifWorkerChat } from "../src/akif/intelligence/workerClient.ts";
const fetchBefore = globalThis.fetch;
const setTimeoutBefore = globalThis.setTimeout;
const urlBefore = process.env.AKIF_WORKER_URL;
const tokenBefore = process.env.AKIF_WORKER_TOKEN;
afterEach(() => {
  globalThis.fetch = fetchBefore;
  globalThis.setTimeout = setTimeoutBefore;
  if (urlBefore === undefined) delete process.env.AKIF_WORKER_URL; else process.env.AKIF_WORKER_URL = urlBefore;
  if (tokenBefore === undefined) delete process.env.AKIF_WORKER_TOKEN; else process.env.AKIF_WORKER_TOKEN = tokenBefore;
});
test("worker deadlines allow one model call or all three specialist calls to finish", async () => {
  process.env.AKIF_WORKER_URL = "https://worker.example";
  process.env.AKIF_WORKER_TOKEN = "dummy";
  const deadlines: number[] = [];
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay: number) => {
    deadlines.push(delay);
    return setTimeoutBefore(callback, 120_000);
  }) as typeof setTimeout;
  globalThis.fetch = async (_url, init) => {
    assert.equal((init?.headers as Record<string,string>)["x-akif-worker-token"], "dummy");
    return Response.json({ answer: "ok" });
  };
  await analyzeAkifProduct({ product: "test" });
  await runAkifReasoning({ mode: "single" });
  await runAkifReasoning({ mode: "specialist_review" });
  assert.deepEqual(deadlines, [25_000, 25_000, 70_000]);
});

test("worker conversation transport never extends a short remaining caller budget", async () => {
  process.env.AKIF_WORKER_URL = "https://worker.example";
  process.env.AKIF_WORKER_TOKEN = "dummy";
  let requestedTimeout = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay: number) => {
    requestedTimeout = delay;
    return setTimeoutBefore(callback, delay);
  }) as typeof setTimeout;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "quick reply" } }] });
  assert.equal((await runAkifWorkerChat("hello", undefined, 100)).content, "quick reply");
  assert.ok(requestedTimeout <= 100, "worker transport must respect the caller's remaining time");
});

test("worker chat is tagged private unless the caller explicitly says generic", async () => {
  process.env.AKIF_WORKER_URL = "https://worker.example";
  process.env.AKIF_WORKER_TOKEN = "dummy";
  const sent: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)).sensitivity);
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  }) as typeof fetch;
  await runAkifWorkerChat("deal with Acme at 40 USD");
  await runAkifWorkerChat("what is MOQ", undefined, 15_000, "generic");
  await runAkifWorkerChat("x", undefined, 15_000, "anything" as never);
  assert.deepEqual(sent, ["private", "generic", "private"]);
});
