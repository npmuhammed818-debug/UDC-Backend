import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { requestedDealPause, pausedNoticeToOther, closedNoticeToOther, dealPausePrompt } from "../src/deals/dealPauseText.ts";

test("only explicit pause/close commands match; confirm needs the exact words", () => {
  assert.deepEqual(requestedDealPause("pause deal"), { kind: "pause", confirmed: false });
  assert.deepEqual(requestedDealPause("Please close this deal."), { kind: "close", confirmed: false });
  assert.deepEqual(requestedDealPause("CONFIRM PAUSE DEAL"), { kind: "pause", confirmed: true });
  assert.deepEqual(requestedDealPause("confirm close deal"), { kind: "close", confirmed: true });
  for (const t of ["should we pause the deal?", "I may pause deal later", "confirm", "cancel deal now please", "yes"]) assert.equal(requestedDealPause(t), null, t);
});
test("notices to the other side are neutral: no reason, no blame, no names", () => {
  for (const n of [pausedNoticeToOther("UDC-D1"), closedNoticeToOther("UDC-D1")]) {
    assert.ok(n.includes("UDC-D1")); assert.ok(!/because|reason|buyer|seller|company|fault|refus|withdr/i.test(n), n);
  }
  assert.ok(dealPausePrompt("pause", "UDC-D1").includes("CONFIRM PAUSE DEAL"));
});
test("route wiring: confirm context, other side only, admin notice is no longer raw status", async () => {
  const wh = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.ok(wh.includes("replyContextKind !== ctxKind") && wh.includes("requestedDealPause(message.text.body) !== null"));
  const dp = await readFile(new URL("../src/deals/dealPause.ts", import.meta.url), "utf8");
  assert.ok(dp.includes("userId: input.receiverId") && !dp.includes("userId: input.senderId, type"));
  const ad = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
  assert.ok(ad.includes("is paused. No action is needed from you right now"));
});
