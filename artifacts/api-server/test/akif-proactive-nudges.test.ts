import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_DATABASE_URL ??= "postgres://localhost:5432/test";
const { planNudges } = await import("../src/akif/proactivePlan.ts");
type NudgeTarget = import("../src/akif/proactivePlan.ts").NudgeTarget;

const NOW = new Date("2026-11-08T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const baseDeal = { id: "d1", status: "negotiating", updatedAt: day(4), buyerUserId: "u1", sellerUserId: "u2" };
const baseReq = { id: "r1", status: "open", updatedAt: day(3), buyerUserId: "u1" };
const phones = new Map([["u1", "15555550178"], ["u2", "15555550179"]]);

const kinds = (list: NudgeTarget[]) => list.map((t) => t.kind).sort();


test("nudges a stalled negotiating deal, both parties", () => {
  const out = planNudges({ now: NOW, deals: [baseDeal], requirements: [], phones, recentNudges: new Set() });
  assert.deepEqual(kinds(out), ["stalled_deal", "stalled_deal"]);
  assert.doesNotMatch(out[0].reason, /menu/i);
});

test("nudges a recent deal update and skips completed quiet deals", () => {
  const fresh = { ...baseDeal, updatedAt: day(0.1), status: "deposit_pending" };
  const done = { ...baseDeal, id: "d2", status: "completed", updatedAt: day(10) };
  const out = planNudges({ now: NOW, deals: [fresh, done], requirements: [], phones, recentNudges: new Set() });
  assert.deepEqual(kinds(out), ["deal_update", "deal_update"]);
});

test("nudges a stale open requirement, never a closed one", () => {
  const closed = { ...baseReq, id: "r2", status: "matched" };
  const out = planNudges({ now: NOW, deals: [], requirements: [baseReq, closed], phones, recentNudges: new Set() });
  assert.deepEqual(kinds(out), ["stale_need"]);
});

test("respects cooldown and never nudges a user without a phone", () => {
  const recent = new Set(["stalled_deal:d1:u1"]);
  const sparse = new Map([["u1", "15555550178"]]);
  const out = planNudges({ now: NOW, deals: [baseDeal], requirements: [], phones: sparse, recentNudges: recent });
  assert.equal(out.length, 0);
});

test("dedupes the same reason for the same user", () => {
  const out = planNudges({ now: NOW, deals: [baseDeal, { ...baseDeal }], requirements: [], phones, recentNudges: new Set() });
  assert.equal(out.length, 2);
});
