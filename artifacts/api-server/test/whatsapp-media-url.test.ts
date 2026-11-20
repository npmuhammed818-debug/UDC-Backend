import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedMediaDownloadUrl } from "../src/whatsapp/mediaUrl.ts";

test("media download: real Meta media hosts are allowed", () => {
  assert.equal(isAllowedMediaDownloadUrl("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc&ext=1&hash=x"), true);
  assert.equal(isAllowedMediaDownloadUrl("https://scontent.xx.fbcdn.net/v/t62.7118-24/abc?oh=x"), true);
  assert.equal(isAllowedMediaDownloadUrl("https://mmg.whatsapp.net/v/t62.7118-24/abc?oh=x"), true);
});

test("media download: non-Meta hosts never receive the access token", () => {
  assert.equal(isAllowedMediaDownloadUrl("https://evil.example/steal"), false);
  assert.equal(isAllowedMediaDownloadUrl("https://fbsbx.com.evil.example/"), false);
  assert.equal(isAllowedMediaDownloadUrl("https://notfbsbx.com/"), false);
});

test("media download: plain http and malformed URLs are refused", () => {
  assert.equal(isAllowedMediaDownloadUrl("http://lookaside.fbsbx.com/x"), false);
  assert.equal(isAllowedMediaDownloadUrl("not a url"), false);
  assert.equal(isAllowedMediaDownloadUrl(""), false);
});
