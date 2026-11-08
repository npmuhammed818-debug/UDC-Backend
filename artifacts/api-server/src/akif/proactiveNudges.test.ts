import { describe, expect, it } from "vitest";
process.env.SUPABASE_DATABASE_URL ??= "postgres://localhost:5432/test";
const { planNudges, isProactiveEnabled } = await import("./proactiveNudges.ts");
type NudgeTarget = import("./proactiveNudges.ts").NudgeTarget;

const NOW = new Date("2026-11-08T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const baseDeal = { id: "d1", status: "negotiating", updatedAt: day(4), buyerUserId: "u1", sellerUserId: "u2" };
const baseReq = { id: "r1", status: "open", updatedAt: day(3), buyerUserId: "u1" };
const phones = new Map([["u1", "15555550178"], ["u2", "15555550179"]]);

function kinds(list: NudgeTarget[]) { return list.map((t) => t.kind).sort(); }

describe("proactive nudges", () => {
  it("stays disabled by default", () => {
    delete process.env.AKIF_PROACTIVE_ENABLED;
    expect(isProactiveEnabled()).toBe(false);
  });

  it("nudges a stalled negotiating deal, both parties", () => {
    const out = planNudges({ now: NOW, deals: [baseDeal], requirements: [], phones, recentNudges: new Set() });
    expect(kinds(out)).toEqual(["stalled_deal", "stalled_deal"]);
    expect(out[0].reason).not.toMatch(/menu/i);
  });

  it("nudges a recent deal update and skips completed deals when quiet", () => {
    const fresh = { ...baseDeal, updatedAt: day(0.1), status: "deposit_pending" };
    const done = { ...baseDeal, id: "d2", status: "completed", updatedAt: day(10) };
    const out = planNudges({ now: NOW, deals: [fresh, done], requirements: [], phones, recentNudges: new Set() });
    expect(kinds(out)).toEqual(["deal_update", "deal_update"]);
  });

  it("nudges a stale open requirement, never a closed one", () => {
    const closed = { ...baseReq, id: "r2", status: "matched" };
    const out = planNudges({ now: NOW, deals: [], requirements: [baseReq, closed], phones, recentNudges: new Set() });
    expect(kinds(out)).toEqual(["stale_need"]);
  });

  it("respects the cooldown and never nudges a user without a phone", () => {
    const recent = new Set(["stalled_deal:d1:u1"]);
    const sparse = new Map([["u1", "15555550178"]]);
    const out = planNudges({ now: NOW, deals: [baseDeal], requirements: [], phones: sparse, recentNudges: recent });
    expect(out).toHaveLength(0);
  });

  it("dedupes the same reason for the same user", () => {
    const dup = { ...baseDeal, id: "d1" };
    const out = planNudges({ now: NOW, deals: [dup, dup], requirements: [], phones, recentNudges: new Set() });
    expect(out).toHaveLength(2);
  });
});
