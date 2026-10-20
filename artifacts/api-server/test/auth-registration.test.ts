import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('all web registration roles await human review and record consent before session creation',async()=>{
  const state:any={users:[],audits:[],preferences:[],sessions:0};
  const tables:any={users:{name:'users',id:'id'},audit:{name:'audits'},preferences:{name:'preferences'}};
  state.db={transaction:async(f:any)=>f(state.db),select:()=>({from:(table:any)=>({where:(condition:any)=>({limit:async()=>state[table.name].filter((row:any)=>row.email===condition.values.at(-1))})})}),insert:(table:any)=>({values:(input:any)=>{let created:any;const run=()=>{if(!created){created={id:randomUUID(),...input};state[table.name].push(created);}return [created]};return {returning:async()=>run(),then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};}})};
  (globalThis as any).__authRegistration=state;
  const output=fileURLToPath(new URL(`./auth-registration-${randomUUID()}.mjs`,import.meta.url));
  const result=await build({stdin:{contents:"import express from 'express';import auth from '../src/routes/auth';const app=express();app.use(express.json());app.use(auth);export default app;",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-registration',setup(b){
    const fixtures:any={db:`const s=globalThis.__authRegistration;export const db=s.db;export const usersTable=${JSON.stringify(tables.users)};export const auditLogsTable=${JSON.stringify(tables.audit)};export const notificationPreferencesTable=${JSON.stringify(tables.preferences)};`,orm:'export const sql=(parts,...values)=>({parts,values});export const eq=()=>true;export const ne=()=>true;export const and=()=>true;',sessions:"const s=globalThis.__authRegistration;export const SESSION_COOKIE='fixture-session';export const createSession=async()=>{s.sessions++;return {token:'synthetic-session',expiresAt:new Date(Date.now()+60000)}};export const revokeSession=async()=>{};export const getAuthenticatedUser=async()=>null;",profile:"export const getSafeUserProfile=async id=>{const user=globalThis.__authRegistration.users.find(u=>u.id===id);return {id:user.id,role:user.role,status:user.status}};"};
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/auth\/sessions$|^\.\/sessions$/,'sessions'],[/auth\/userProfile$/,'profile']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,result.outputFiles[0].text);let server:any;
  try {
    const {default:app}=await import(output);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const post=async(body:any)=>fetch(`http://127.0.0.1:${server.address().port}/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const base={full_name:'Synthetic Registrant',password:'Fixture-Password9!',accepted_terms:true,adult_business_user:true};
    for(const role of ['buyer','seller','agent']){const response=await post({...base,role,email:`${role}@example.invalid`});assert.equal(response.status,201);const body=await response.json();assert.equal(body.user.role,role);assert.equal(body.user.status,'pending');}
    assert.equal(state.sessions,3);assert.equal(state.audits.length,3);assert.equal(state.preferences.length,3);
    assert.ok(state.audits.every((row:any)=>row.metadata.termsAccepted&&row.metadata.adultBusinessUser));
    assert.ok(state.preferences.every((row:any)=>row.optionalWhatsApp===false&&row.announcements===false));
    const response=await post({...base,role:'agent',email:'no-consent@example.invalid',accepted_terms:false});assert.equal(response.status,400);await response.arrayBuffer();assert.equal(state.users.length,3);assert.equal(state.sessions,3);
  } finally {if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await unlink(output);delete (globalThis as any).__authRegistration;}
});
