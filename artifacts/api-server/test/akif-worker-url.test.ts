import { test } from "node:test";
import assert from "node:assert/strict";
import { workerUrlAllowed } from "../src/akif/intelligence/workerClient.ts";

test("worker URL: https hosts are allowed", () => {
  assert.equal(workerUrlAllowed("https://akif-worker.onrender.com"), true);
  assert.equal(workerUrlAllowed("https://worker.example.com:8443/path"), true);
});

test("worker URL: plain http is refused outside loopback so the token never travels cleartext", () => {
  assert.equal(workerUrlAllowed("http://akif-worker.onrender.com"), false);
  assert.equal(workerUrlAllowed("http://192.168.1.10:8000"), false);
});

test("worker URL: loopback http stays available for local development", () => {
  assert.equal(workerUrlAllowed("http://localhost:8000"), true);
  assert.equal(workerUrlAllowed("http://127.0.0.1:8000"), true);
});

test("worker URL: malformed values are refused", () => {
  assert.equal(workerUrlAllowed("not a url"), false);
  assert.equal(workerUrlAllowed("ftp://worker.example.com"), false);
});
