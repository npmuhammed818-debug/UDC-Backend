export type AgentChainMember = {
  userId: string;
  referredByAgentUserId: string | null;
  referralPosition: number | null;
  commissionSharePct: string | null;
};

function shareValue(value: string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nextReferralPosition(members: AgentChainMember[]): number {
  return members.reduce((max, member) => Math.max(max, member.referralPosition ?? 0), 0) + 1;
}

export function allocatedCommissionShare(
  members: AgentChainMember[],
  excludingUserId?: string,
): number {
  return members.reduce((total, member) => {
    if (excludingUserId && member.userId === excludingUserId) return total;
    return total + shareValue(member.commissionSharePct);
  }, 0);
}

export function canAllocateCommissionShare(
  members: AgentChainMember[],
  requestedSharePct: number | undefined,
  excludingUserId?: string,
): boolean {
  if (requestedSharePct === undefined) return true;
  return allocatedCommissionShare(members, excludingUserId) + requestedSharePct <= 100.000001;
}

export function buildSafeReferralChain(members: AgentChainMember[], viewerUserId: string) {
  const sorted = [...members].sort((a, b) => {
    const left = a.referralPosition ?? Number.MAX_SAFE_INTEGER;
    const right = b.referralPosition ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
  const positions = new Map(sorted.map((member) => [member.userId, member.referralPosition]));

  return sorted.map((member, index) => ({
    agentLabel: `Agent ${member.referralPosition ?? index + 1}`,
    position: member.referralPosition ?? index + 1,
    referredByPosition: member.referredByAgentUserId
      ? positions.get(member.referredByAgentUserId) ?? null
      : null,
    commissionSharePct: member.commissionSharePct === null ? null : Number(member.commissionSharePct),
    isYou: member.userId === viewerUserId,
  }));
}
