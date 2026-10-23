import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runConversationChat } from "../src/akif/intelligence/hermesClient.ts";
const keys = ["AKIF_BRAIN_URL", "AKIF_WORKER_CONVERSATION_ENABLED", "AKIF_WORKER_URL", "AKIF_WORKER_TOKEN", "NVIDIA_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL", "HERMES_AKIF_URL", "HERMES_AKIF_API_KEY"];
const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const fetchBefore = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchBefore; for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; } });
function configure() {
  for (const key of keys) delete process.env[key];
  process.env.AKIF_WORKER_CONVERSATION_ENABLED = "true";
  process.env.AKIF_WORKER_URL = "https://worker.example";
  process.env.AKIF_WORKER_TOKEN = "internal-test";
}
test("WhatsApp conversation uses configured worker without exposing provider keys", async () => {
  configure();
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal((init!.headers as Record<string,string>)["x-akif-worker-token"], "internal-test");
    const body = JSON.parse(String(init!.body));
    assert.deepEqual(body.messages, [{ role: "system", content: "UDC DLC rules" }, { role: "user", content: "100 MT copper" }]);
    assert.equal(body.timeout_seconds, 14);
    return Response.json({ choices: [{ message: { content: '{"replyToSender":"Where do you need delivery?"}' } }] });
  };
  const result = await runConversationChat("100 MT copper", "UDC DLC rules", 15000);
  assert.match(result.content, /delivery/);
  assert.deepEqual(calls, ["https://worker.example/chat/completions"]);
});
test("worker quota failure preserves existing conversation fallback", async () => {
  configure();
  process.env.OPENAI_API_KEY = "test";
  process.env.OPENAI_BASE_URL = "https://fallback.example/v1";
  globalThis.fetch = async (url) => String(url).includes("worker.example")
    ? new Response("rate limit", { status: 429 })
    : Response.json({ choices: [{ message: { content: "fallback reply" } }] });
  assert.equal((await runConversationChat("hello")).content, "fallback reply");
});

test("fallback transport gets only the time remaining after the worker fails", async t => {
  configure();
  process.env.OPENAI_API_KEY = "test";
  process.env.OPENAI_BASE_URL = "https://fallback.example/v1";
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  const deadlines: number[] = [];
  const nativeSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", ((callback: (...args: unknown[]) => void, delay: number) => {
    deadlines.push(delay);
    return nativeSetTimeout(callback, delay);
  }) as typeof setTimeout);
  globalThis.fetch = async url => {
    if (String(url).includes("worker.example")) {
      elapsed = 9000;
      return new Response("unavailable", { status: 503 });
    }
    return Response.json({ choices: [{ message: { content: "fallback within deadline" } }] });
  };
  assert.equal((await runConversationChat("hello", undefined, 15000)).content, "fallback within deadline");
  assert.equal(deadlines.length, 2);
  assert.ok(deadlines[1] <= 6000, "fallback must not restart the full 15-second deadline");
});

test("an exhausted conversation deadline prevents requests to later providers", async t => {
  configure();
  process.env.OPENAI_API_KEY = "test";
  process.env.OPENAI_BASE_URL = "https://fallback.example/v1";
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  const calls: string[] = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes("worker.example")) {
      elapsed = 15001;
      throw new DOMException("Synthetic worker timeout", "AbortError");
    }
    return Response.json({ choices: [{ message: { content: "too late" } }] });
  };
  await assert.rejects(runConversationChat("hello", undefined, 15000), { name: "AbortError" });
  assert.deepEqual(calls, ["https://worker.example/chat/completions"]);
});

test("a response parsed after the deadline is not accepted as an on-time answer", async t => {
  configure();
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      elapsed = 15001;
      return { choices: [{ message: { content: "late answer" } }] };
    },
  }) as Response;
  await assert.rejects(runConversationChat("hello", undefined, 15000), { name: "AbortError" });
});
