import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function AgentInvitationCard({ status }: { status: string }) {
  const eligible = status === 'verified';
  const [copyStatus, setCopyStatus] = useState('');
  const invitation = useQuery({ queryKey: ['agent-referral-link'], enabled: eligible, queryFn: async () => {
    const response = await fetch('/api/agent/referral-link', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Invitation unavailable');
    return response.json() as Promise<{ referralCode: string; referralUrl: string }>;
  } });
  return <section className="panel mt-5" data-testid="agent-invitation"><div className="section-heading"><div><div className="eyebrow">INVITE A NEW PARTICIPANT</div><h2>Your referral link</h2></div></div>
    {!eligible ? <p>Your agent registration needs UDC approval before you can create an invitation.</p> : invitation.isLoading ? <p>Preparing your link…</p> : invitation.isError ? <div><p>Your invitation link is unavailable.</p><Button className="mt-3" variant="outline" onClick={() => void invitation.refetch()}>Try again</Button></div> : invitation.data && <><p className="text-sm">Share this with a buyer or seller who agrees to be introduced. They can attach your introduction when registering. UDC reviews the referral and any separately agreed reward.</p><label className="block text-sm mt-3">Referral code<Input className="mt-2" readOnly value={invitation.data.referralCode} /></label><label className="block text-sm mt-3">Invitation link<Input className="mt-2" readOnly value={invitation.data.referralUrl} onFocus={event => event.currentTarget.select()} /></label><Button className="mt-3" onClick={async () => { try { await navigator.clipboard.writeText(invitation.data.referralUrl); setCopyStatus('Link copied.'); } catch { setCopyStatus('Select the link above and copy it.'); } }}>Copy invitation link</Button>{copyStatus && <p role="status" className="mt-2 text-sm">{copyStatus}</p>}</>}
  </section>;
}
