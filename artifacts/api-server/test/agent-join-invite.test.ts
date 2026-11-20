import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { agentJoinCommand, agentJoinLink, invitedByGreeting, isInviteDecline, maskName, parseJoinCode, redactedStage, INVITE_QUESTION } from "../src/referrals/joinInvite.ts";
import { agentReferralCode } from "../src/referrals/invitation.ts";

const agent = "11111111-2222-4333-8444-555555555555";

test("join link carries the code and only uses a configured number", () => {
  const code = agentReferralCode(agent);
  assert.equal(agentJoinCommand(agent), `JOIN ${code}`);
  assert.equal(agentJoinLink(agent, "+15551234567"), `https://wa.me/15551234567?text=${encodeURIComponent(`JOIN ${code}`)}`);
  for (const bad of [undefined, "", "abc", "https://evil.example", "+0123", "15551234567/../x"]) assert.equal(agentJoinLink(agent, bad), null, String(bad));
  assert.equal(agentJoinLink("not-a-uuid", "15551234567"), null);
  assert.throws(() => agentJoinCommand("nope"));
});

test("JOIN codes parse strictly", () => {
  assert.equal(parseJoinCode("JOIN UDC-111122223333"), "UDC-111122223333");
  assert.equal(parseJoinCode("join udc-abcdef123456"), "UDC-ABCDEF123456");
  assert.equal(parseJoinCode("UDC-ABCDEF123456"), "UDC-ABCDEF123456");
  for (const bad of ["JOIN UDC-123", "JOIN UDC-ZZZZ22223333", "hello JOIN UDC-111122223333", "JOIN UDC-111122223333 and more", "", undefined, "x".repeat(100)]) assert.equal(parseJoinCode(bad), null, String(bad));
});

test("greeting, one-time question, decline and privacy masking", () => {
  assert.equal(invitedByGreeting("Rashid K"), "You were invited by Rashid K.");
  assert.equal(invitedByGreeting(""), "You were invited by a UDC agent.");
  assert.match(INVITE_QUESTION, /did anyone invite you/i);
  for (const t of ["no", "No.", "nobody", "No thanks"]) assert.ok(isInviteDecline(t), t);
  for (const t of ["I need copper", "no I want 100 MT", ""]) assert.ok(!isInviteDecline(t), t);
  assert.equal(maskName("Mohammed Ali"), "M******");
  assert.equal(maskName(""), "Member");
  assert.ok(!maskName("Rashid").includes("ashid"));
  assert.equal(redactedStage("under_review"), "in review");
  assert.equal(redactedStage("completed"), "completed");
});

test("wiring: invite menu uses the join link, QR route is agent-only, my invites is agent-only", async () => {
  const ui = await readFile(new URL("../src/whatsapp/chatUi.ts", import.meta.url), "utf8");
  assert.ok(ui.includes("agentJoinLink(user.id,process.env.UDC_WHATSAPP_PUBLIC_NUMBER)"));
  assert.ok(ui.includes("agent&&agentMenuOpen(agent)"));
  const route = await readFile(new URL("../src/routes/referrals.ts", import.meta.url), "utf8");
  const at = route.indexOf('router.get("/agent/invite"');
  assert.ok(at > 0 && route.slice(at, at + 300).includes('role !== "agent"'));
  const svc = await readFile(new URL("../src/referrals/joinService.ts", import.meta.url), "utf8");
  assert.ok(!/price|quantity|payment|document/i.test(svc.slice(svc.indexOf("myInvitesReply"))), "my invites must not expose deal terms");
});
