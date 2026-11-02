import { test } from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../src/lib/errorHandler.ts";

function fakeRes() {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

const fakeReq = { log: { error() {} } } as never;
const noop = () => {};

test("error handler answers 500 with a fixed generic body for ordinary errors", () => {
  const res = fakeRes();
  errorHandler(new Error("db password is hunter2 /home/app/src/secret.ts:42"), fakeReq, res as never, noop);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "internal_error" });
});

test("error handler never leaks the error message or stack in the response", () => {
  const res = fakeRes();
  errorHandler(new Error("sensitive internals"), fakeReq, res as never, noop);
  assert.ok(!JSON.stringify(res.body).includes("sensitive"));
});

test("error handler maps client-error statuses to generic 4xx bodies", () => {
  const res400 = fakeRes();
  errorHandler(Object.assign(new SyntaxError("Unexpected token"), { status: 400 }), fakeReq, res400 as never, noop);
  assert.equal(res400.statusCode, 400);
  assert.deepEqual(res400.body, { error: "invalid_request_body" });

  const res413 = fakeRes();
  errorHandler(Object.assign(new Error("too big"), { status: 413 }), fakeReq, res413 as never, noop);
  assert.equal(res413.statusCode, 413);
  assert.deepEqual(res413.body, { error: "request_too_large" });
});

test("error handler treats out-of-range statuses as 500", () => {
  const res = fakeRes();
  errorHandler(Object.assign(new Error("weird"), { status: 302 }), fakeReq, res as never, noop);
  assert.equal(res.statusCode, 500);
});

test("error handler does not double-send when headers are already sent", () => {
  const res = fakeRes();
  res.headersSent = true;
  errorHandler(new Error("late"), fakeReq, res as never, noop);
  assert.equal(res.statusCode, 0);
});
