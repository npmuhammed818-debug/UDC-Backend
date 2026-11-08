import { test } from "node:test";
import assert from "node:assert/strict";
import { admitBrainTurn, admitLlmCall, finishBrainTurn, finishLlmCall, llmGuardDefaults, resetLlmGuards } from "../src/akif/llmGuards.ts";

test("per-phone in-flight guard blocks a second concurrent turn", () => {
  resetLlmGuards();
  assert.equal(admitBrainTurn("111"), "ok");
  assert.equal(admitBrainTurn("111"), "already_in_flight");
  assert.equal(admitBrainTurn("222"), "ok"); // another customer unaffected
  finishBrainTurn("111");
  assert.equal(admitBrainTurn("111"), "ok");
});

test("per-phone hourly rate limit trips and resets next hour", () => {
  resetLlmGuards();
  const t0 = new Date("2026-11-08T10:00:00Z");
  for (let i = 0; i < llmGuardDefaults.msgsPerHourPerPhone; i++) {
    assert.equal(admitBrainTurn("333", t0), "ok");
    finishBrainTurn("333");
  }
  assert.equal(admitBrainTurn("333", t0), "rate_limited");
  assert.equal(admitBrainTurn("333", new Date("2026-11-08T11:00:01Z")), "ok");
});

test("daily LLM cap trips globally and resets next day", () => {
  resetLlmGuards();
  const t0 = new Date("2026-11-08T10:00:00Z");
  for (let i = 0; i < llmGuardDefaults.dailyLlmCallCap; i++) {
    assert.equal(admitLlmCall(t0), "ok");
    finishLlmCall();
  }
  assert.equal(admitLlmCall(t0), "daily_cap");
  assert.equal(admitLlmCall(new Date("2026-11-09T00:00:01Z")), "ok");
});

test("concurrency semaphore blocks past the max and frees on finish", () => {
  resetLlmGuards();
  for (let i = 0; i < llmGuardDefaults.maxConcurrentLlm; i++) assert.equal(admitLlmCall(), "ok");
  assert.equal(admitLlmCall(), "llm_busy");
  finishLlmCall();
  assert.equal(admitLlmCall(), "ok");
});
