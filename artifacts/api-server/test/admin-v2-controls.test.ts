import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const page=(n:string)=>readFile(new URL(`../../udc-app/src/pages/${n}`,import.meta.url),'utf8');
test('finance forms require a human confirmation and explain side effects',async()=>{
 const source=await page('admin-v2-finance-controls.tsx');
 for(const part of ['if(!confirmed)return','disabled={busy || !confirmed}','This does not move money','may send the beneficiary a WhatsApp notice','confirmAgreedTerms:true','/api/admin/financial-instruments','/api/admin/commissions'])assert.ok(source.includes(part),part);
 assert.ok(!source.includes('AI-generated'));
});
test('trade detail page renders every returned field as escaped text and asks before review',async()=>{
 const source=await page('admin-v2-trades.tsx');
 for(const part of ['Object.keys(item)','JSON.stringify(item[f])','Confirm review','setReview','/status'])assert.ok(source.includes(part),part);
 assert.ok(!source.includes('dangerouslySetInnerHTML'));
 const app=await readFile(new URL('../../udc-app/src/App.tsx',import.meta.url),'utf8');
 assert.ok(app.includes('path="/admin/v2/trades"'));
 const shell=await page('admin-v2-shell.tsx');assert.ok(shell.includes("'/admin/v2/trades'"));
});
test('support tools keep privacy review separate from deletion and incident notices human-approved',async()=>{
 const support=await page('admin-v2-support.tsx');
 for(const text of ['AdminPrivacyRequests','/api/admin/grievances','/update','IncidentControls'])assert.ok(support.includes(text),text);
 const incidents=await page('admin-v2-incidents.tsx');
 for(const text of ['if(notify&&!confirmed)return','disabled={busy||!confirmed||!incidentId}','WhatsApp and email were not sent','affectedUserIds:affected','Sending again creates another notice'])assert.ok(incidents.includes(text),text);
 assert.ok(!incidents.includes('dangerouslySetInnerHTML'));
});
test('people directory uses protected routes and does not silently activate a role',async()=>{
 const source=await page('admin-v2-people-controls.tsx');
 for(const part of ['/api/admin/users','/api/admin/role-change-requests','if(!roleId&&!confirmed)return','permissions unchanged','type="checkbox"'])assert.ok(source.includes(part),part);
 assert.ok(!source.includes("value=\"activate\""));
 assert.ok(!source.includes('dangerouslySetInnerHTML'));
});
test('agent actions do not create commissions or payments and require human approval',async()=>{
 const source=await page('admin-v2-agents.tsx');
 for(const part of ['if(confirmed!==kind)return',"disabled={busy||confirmed!=='create'}",'No fee or commission is agreed','/api/admin/referrals','/api/admin/deals/','/admin/v2/finance'])assert.ok(source.includes(part),part);
 assert.ok(!source.includes("fetch('/api/admin/commissions'"));
});
test('chats show full text and separate direct messages, participants and case controls',async()=>{
 const source=await page('admin-v2-more.tsx');
 for(const part of ['v2-chat-room','/room','Saved direct messages','Participants','<CaseControls'])assert.ok(source.includes(part),part);
 assert.ok(!source.includes("String(ev.originalText || '').slice"));
 const controls=await page('admin-v2-case-controls.tsx');
 assert.ok(controls.includes('Opening a case notifies the deal parties'));
 assert.ok(controls.includes('/evidence'));
});

test('commission correction UI names pending-only scope, human agreement and preserved history',async()=>{
 const source=await page('admin-v2-finance-controls.tsx');
 for(const part of ['Correct pending commission terms','expectedAmount:editCommission.amount','Evidence and reason for correction','Paid and cancelled records stay unchanged','confirmAgreedTerms:true'])assert.ok(source.includes(part),part);
});
