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
