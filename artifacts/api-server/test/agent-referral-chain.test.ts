import assert from "node:assert/strict";
import test from "node:test";
import {
  allocatedCommissionShare,
  buildSafeReferralChain,
  canAllocateCommissionShare,
  nextReferralPosition,
  type AgentChainMember,
} from "../src/referrals/agentChain";

const chain: AgentChainMember[] = [
  { userId: "a", referredByAgentUserId: null, referralPosition: 1, commissionSharePct: "20.000" },
  { userId: "b", referredByAgentUserId: "a", referralPosition: 2, commissionSharePct: "15.000" },
  { userId: "c", referredByAgentUserId: "b", referralPosition: 3, commissionSharePct: null },
];

test("referral chain advances positions and caps the shared commission pool", () => {
  assert.equal(nextReferralPosition(chain), 4);
  assert.equal(allocatedCommissionShare(chain), 35);
  assert.equal(canAllocateCommissionShare(chain, 65), true);
  assert.equal(canAllocateCommissionShare(chain, 65.001), false);
});

test("referral chain view hides agent identity but keeps parent position and share", () => {
  assert.deepEqual(buildSafeReferralChain(chain, "b"), [
    { agentLabel: "Agent 1", position: 1, referredByPosition: null, commissionSharePct: 20, isYou: false },
    { agentLabel: "Agent 2", position: 2, referredByPosition: 1, commissionSharePct: 15, isYou: true },
    { agentLabel: "Agent 3", position: 3, referredByPosition: 2, commissionSharePct: null, isYou: false },
  ]);
});
