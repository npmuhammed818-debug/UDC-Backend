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
