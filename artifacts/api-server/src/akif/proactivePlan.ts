// Pure nudge planning (db-free so it is testable under node:test).
export const NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60_000;
export const STALE_NEED_MS = 2 * 24 * 60 * 60_000;
export const STALLED_DEAL_MS = 3 * 24 * 60 * 60_000;
export const DEAL_UPDATE_MS = 24 * 60 * 60_000;
const ACTIVE_DEAL_STATUSES = ["initiated", "negotiating"];

export type NudgeTarget =
  | { kind: "deal_update" | "stalled_deal"; dealId: string; userId: string; phone: string; reason: string }
  | { kind: "stale_need"; requirementId: string; userId: string; phone: string; reason: string };

// Pure planner: which customers are due a nudge right now. Tested directly.
export function planNudges(input: {
  now: Date;
  deals: Array<{ id: string; status: string; updatedAt: Date; buyerUserId: string | null; sellerUserId: string | null }>;
  requirements: Array<{ id: string; status: string; updatedAt: Date; buyerUserId: string | null }>;
  phones: Map<string, string>;           // userId -> phone
  recentNudges: Set<string>;             // `${kind}:${entityId}:${userId}` sent within cooldown
}): NudgeTarget[] {
  const out: NudgeTarget[] = [];
  const seen = new Set<string>();
  const push = (t: NudgeTarget) => {
    const key = `${t.kind}:${"dealId" in t ? t.dealId : t.requirementId}:${t.userId}`;
    if (input.recentNudges.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const deal of input.deals) {
    const age = input.now.getTime() - deal.updatedAt.getTime();
    const parties: Array<[string | null, string]> = [[deal.buyerUserId, "buyer"], [deal.sellerUserId, "seller"]];
    for (const [userId, role] of parties) {
      if (!userId) continue;
      const phone = input.phones.get(userId);
      if (!phone) continue;
      if (age <= DEAL_UPDATE_MS) {
        push({ kind: "deal_update", dealId: deal.id, userId, phone, reason: `The ${role}'s deal moved to status "${deal.status}" in the last day. Give them the update warmly and ask at most one light question.` });
      } else if (ACTIVE_DEAL_STATUSES.includes(deal.status) && age >= STALLED_DEAL_MS) {
        push({ kind: "stalled_deal", dealId: deal.id, userId, phone, reason: `The ${role}'s deal (status "${deal.status}") has been quiet for about ${Math.round(age / 86_400_000)} days. Check in gently - how are they doing, is anything blocking, no pressure.` });
      }
    }
  }
  for (const req of input.requirements) {
    if (req.status !== "open" || !req.buyerUserId) continue;
    const phone = input.phones.get(req.buyerUserId);
    if (!phone) continue;
    const age = input.now.getTime() - req.updatedAt.getTime();
    if (age >= STALE_NEED_MS) {
      push({ kind: "stale_need", requirementId: req.id, userId: req.buyerUserId, phone, reason: `This buyer's requirement has been waiting about ${Math.round(age / 86_400_000)} days without an update. Reassure them UDC is on it and ask if anything changed on their side.` });
    }
  }
  return out;
}

