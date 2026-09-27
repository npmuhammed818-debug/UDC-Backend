import assert from "node:assert/strict";
import { test } from "node:test";
import { runConversationChat } from "../src/akif/intelligence/hermesClient.ts";

const keys = [
  "AKIF_BRAIN_URL",
  "AKIF_BRAIN_API_KEY",
  "AKIF_BRAIN_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_CHAT_MODEL",
  "HERMES_AKIF_URL",
  "HERMES_AKIF_API_KEY",
];

function snapshotEnv() {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(oldEnv: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("self-hosted AKIF brain is the first conversation provider", async () => {
  const oldEnv = snapshotEnv();
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];

  Object.assign(process.env, {
    AKIF_BRAIN_URL: "http://akif-brain.local/v1",
    AKIF_BRAIN_MODEL: "qwen3:8b",
    OPENAI_API_KEY: "openai-test",
    OPENAI_BASE_URL: "https://openai.invalid/v1",
    HERMES_AKIF_URL: "https://hermes.invalid",
    HERMES_AKIF_API_KEY: "hermes-test",
  });

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return Response.json({
      choices: [{ message: { content: "AKIF local response" } }],
    });
  };

  try {
    const result = await runConversationChat("hello", "system", 1000);
    assert.equal(result.content, "AKIF local response");
    assert.deepEqual(calls, ["http://akif-brain.local/v1/chat/completions"]);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(oldEnv);
  }
});

test("conversation falls back from AKIF brain to OpenAI to Hermes", async () => {
  const oldEnv = snapshotEnv();
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];

  Object.assign(process.env, {
    AKIF_BRAIN_URL: "http://akif-brain.local/v1",
    AKIF_BRAIN_MODEL: "qwen3:8b",
    OPENAI_API_KEY: "openai-test",
    OPENAI_BASE_URL: "https://openai.invalid/v1",
    HERMES_AKIF_URL: "https://hermes.invalid",
    HERMES_AKIF_API_KEY: "hermes-test",
  });

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("http://akif-brain.local")) {
      return new Response("down", { status: 503 });
    }
    if (url.startsWith("https://openai.invalid")) {
      return new Response("rate limited", { status: 429 });
    }
    return Response.json({
      choices: [{ message: { content: "Hermes response" } }],
    });
  };

  try {
    const result = await runConversationChat("hello", "system", 1000);
    assert.equal(result.content, "Hermes response");
    assert.deepEqual(calls, [
      "http://akif-brain.local/v1/chat/completions",
      "https://openai.invalid/v1/chat/completions",
      "https://hermes.invalid/v1/chat/completions",
    ]);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(oldEnv);
  }
});
