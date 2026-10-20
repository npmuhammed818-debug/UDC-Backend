import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('web registration keeps roles pending and accepts only authorized, consented agent invitations',async()=>{
  const state:any={users:[],audits:[],preferences:[],referrals:[],sessions:0,user:null};
  const previousSecret=process.env.WHATSAPP_APP_SECRET, previousOrigin=process.env.UDC_PUBLIC_APP_URL;
  process.env.WHATSAPP_APP_SECRET="synthetic-referral-secret-long-enough";process.env.UDC_PUBLIC_APP_URL="https://udc.example.invalid";
  const tables:any={users:{name:'users',...Object.fromEntries(['id','email','role','status'].map(column=>[column,{column}]))},audit:{name:'audits'},preferences:{name:'preferences'},referrals:{name:'referrals'}};
  const value=(node:any,row:any)=>node?.column?row[node.column]:node;
  const evaluate=(node:any,row:any):any=>node.kind==='sql'?row.email===node.values.at(-1):node.kind==='eq'?value(node.a,row)===value(node.b,row):node.kind==='and'?node.args.every((part:any)=>evaluate(part,row)):node.kind==='in'?node.list.includes(value(node.a,row)):false;
  state.db={transaction:async(f:any)=>f(state.db),select:()=>({from:(table:any)=>({where:(condition:any)=>({limit:async()=>state[table.name].filter((row:any)=>evaluate(condition,row))})})}),insert:(table:any)=>({values:(input:any)=>{let created:any;const run=()=>{if(!created){created={id:randomUUID(),...input};state[table.name].push(created);}return [created]};return {returning:async()=>run(),then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};}})};
  (globalThis as any).__authRegistration=state;
  const output=fileURLToPath(new URL(`./auth-registration-${randomUUID()}.mjs`,import.meta.url));
  const result=await build({stdin:{contents:"import express from 'express';import auth from '../src/routes/auth';import referrals from '../src/routes/referrals';const app=express();app.use(express.json());app.use((req,res,next)=>{req.authUser=globalThis.__authRegistration.user;next()});app.use(auth);app.use(referrals);export default app;",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-registration',setup(b){
    const fixtures:any={db:`const s=globalThis.__authRegistration;export const db=s.db;export const usersTable=${JSON.stringify(tables.users)};export const auditLogsTable=${JSON.stringify(tables.audit)};export const notificationPreferencesTable=${JSON.stringify(tables.preferences)};export const referralsTable=${JSON.stringify(tables.referrals)};export const dealParticipantsTable={};export const notificationsTable={};export const dealsTable={};`,orm:'export const sql=(parts,...values)=>({kind:"sql",parts,values});export const eq=(a,b)=>({kind:"eq",a,b});export const ne=()=>true;export const and=(...args)=>({kind:"and",args});export const inArray=(a,list)=>({kind:"in",a,list});export const desc=x=>x;',sessions:"const s=globalThis.__authRegistration;export const SESSION_COOKIE='fixture-session';export const createSession=async()=>{s.sessions++;return {token:'synthetic-session',expiresAt:new Date(Date.now()+60000)}};export const revokeSession=async()=>{};export const getAuthenticatedUser=async()=>null;",profile:"export const getSafeUserProfile=async id=>{const user=globalThis.__authRegistration.users.find(u=>u.id===id);return {id:user.id,role:user.role,status:user.status}};"};
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/auth\/sessions$|^\.\/sessions$/,'sessions'],[/auth\/userProfile$/,'profile']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,result.outputFiles[0].text);let server:any;
  try {
    const {default:app}=await import(output);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const post=async(body:any)=>fetch(`http://127.0.0.1:${server.address().port}/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const base={full_name:'Synthetic Registrant',password:'Fixture-Password9!',accepted_terms:true,adult_business_user:true};
    for(const role of ['buyer','seller','agent']){const response=await post({...base,role,email:`${role}@example.invalid`});assert.equal(response.status,201);const body=await response.json();assert.equal(body.user.role,role);assert.equal(body.user.status,'pending');}
    const phoneClaim=await post({...base,role:'buyer',email:'phone-claim@example.invalid',phone:'10000000001'});assert.equal(phoneClaim.status,400);assert.equal(state.users.length,3);
    assert.equal(state.sessions,3);assert.equal(state.audits.length,3);assert.equal(state.preferences.length,3);
    assert.ok(state.audits.every((row:any)=>row.metadata.termsAccepted&&row.metadata.adultBusinessUser));
    assert.ok(state.preferences.every((row:any)=>row.optionalWhatsApp===false&&row.announcements===false));
    const response=await post({...base,role:'agent',email:'no-consent@example.invalid',accepted_terms:false});assert.equal(response.status,400);await response.arrayBuffer();assert.equal(state.users.length,3);assert.equal(state.sessions,3);
    const getLink=()=>fetch(`http://127.0.0.1:${server.address().port}/agent/referral-link`);
    assert.equal((await getLink()).status,401);
    const agentId=randomUUID();const agent={id:agentId,email:'inviter@example.invalid',role:'agent',status:'verified'};state.users.push(agent);
    state.user={...agent,status:'pending'};assert.equal((await getLink()).status,403);
    state.user=agent;const invitation=await getLink();assert.equal(invitation.status,200);const link=await invitation.json();
    const token=new URL(link.referralUrl).searchParams.get('ref');assert.ok(token);assert.equal(new URL(link.referralUrl).origin,'https://udc.example.invalid');
    let invited=await post({...base,role:'buyer',email:'invitee@example.invalid',referral_token:token});assert.equal(invited.status,201);const invitedBody=await invited.json();assert.equal(invitedBody.user.status,'pending');
    assert.equal(state.referrals.length,1);assert.equal(state.referrals[0].agentUserId,agentId);assert.equal(state.referrals[0].referredUserId,invitedBody.user.id);assert.equal(state.referrals[0].status,'pending');
    assert.equal(state.referrals[0].commissionRate,undefined);assert.ok(state.audits.some((row:any)=>row.action==='referral_invitation_accepted'&&row.metadata.introductionAcceptedByRegistrant));
    const before=state.users.length;
    invited=await post({...base,role:'seller',email:'tampered@example.invalid',referral_token:token+'x'});assert.equal(invited.status,400);
    agent.status='suspended';invited=await post({...base,role:'seller',email:'revoked@example.invalid',referral_token:token});assert.equal(invited.status,400);
    assert.equal((await getLink()).status,403);assert.equal(state.users.length,before);assert.equal(state.referrals.length,1);
  } finally {if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await unlink(output);delete (globalThis as any).__authRegistration;if(previousSecret===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=previousSecret;if(previousOrigin===undefined)delete process.env.UDC_PUBLIC_APP_URL;else process.env.UDC_PUBLIC_APP_URL=previousOrigin;}
});
