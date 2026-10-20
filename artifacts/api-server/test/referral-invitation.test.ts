import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createAgentInvitation, verifyAgentInvitation, agentReferralCode } from '../src/referrals/invitation.ts';

test('agent invitation signatures bind the exact agent and a separate signing purpose',()=>{
  const id='11111111-1111-4111-8111-111111111111',secret='synthetic-secret-long-enough';
  const token=createAgentInvitation(id,secret);
  assert.equal(verifyAgentInvitation(token,secret),id);
  assert.equal(verifyAgentInvitation(token,'different-synthetic-secret'),null);
  assert.equal(verifyAgentInvitation(token.replace(id,'22222222-2222-4222-8222-222222222222'),secret),null);
  assert.equal(verifyAgentInvitation('v1.'+id+'.'+createHmac('sha256',secret).update(id).digest('base64url'),secret),null);
  for(const value of ['',token+'.extra','v2'+token.slice(2),token.slice(0,-1),token+'x'])assert.equal(verifyAgentInvitation(value,secret),null);
  assert.equal(agentReferralCode(id),'UDC-'+id.toUpperCase());
  assert.throws(()=>createAgentInvitation(id,''),/unavailable/);
  assert.throws(()=>createAgentInvitation('not-an-id',secret),/invalid_agent/);
});
