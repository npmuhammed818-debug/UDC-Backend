import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReviewService,documentVersion,type ReviewLink,type ReviewRepository} from '../src/documentReview/service.ts';
import {reviewPage} from '../src/documentReview/page.ts';
import {safeRequestLogPath} from '../src/lib/requestLog.ts';

test('recipient/version/expiry/revocation isolation and receipt idempotency',async()=>{
 let now=1000,allowed=true;
 const bytes=new TextEncoder().encode('%PDF-synthetic');
 let doc={id:'doc',dealId:'deal',title:'Fictional LC',version:documentVersion('revision1',bytes),bytes,contentType:'application/pdf'};
 const links=new Map<string,ReviewLink>(),receipts=new Set<string>();
 const repo:ReviewRepository={loadAllowed:async(u,d)=>allowed&&u==='buyer'&&d==='doc'?doc:null,save:async l=>{links.set(l.tokenHash,l);},find:async h=>links.get(h)??null,recordReceipt:async l=>{if(receipts.has(l.id))return 'already_recorded';receipts.add(l.id);return 'recorded';}};
 const s=createReviewService(repo,()=>now),l=await s.issue('buyer','doc');assert.ok(l);
 assert.equal(await s.issue('outsider','doc'),null);
 assert.equal(await s.open(l.token,'seller'),null);
 assert.equal(receipts.size,0,'GET must not approve');
 assert.ok(await s.open(l.token,'buyer'));
 assert.equal(await s.receipt(l.token,'buyer'),'recorded');assert.equal(await s.receipt(l.token,'buyer'),'already_recorded');assert.equal(receipts.size,1);
 doc={...doc,version:documentVersion('revision2',bytes)};
 assert.equal(await s.open(l.token,'buyer'),null,'new version invalidates old link');
 const fresh=await s.issue('buyer','doc');assert.ok(fresh);allowed=false;
 assert.equal(await s.receipt(fresh.token,'buyer'),'unavailable','grant/membership revoked');allowed=true;
 now=fresh.expiresAt;assert.equal(await s.open(fresh.token,'buyer'),null);
 assert.equal(await s.open('bad','buyer'),null);
});
test('review page escapes titles and labels approval limits; tokens are redacted',()=>{
 const h=reviewPage({title:'<script>alert(1)</script>',version:'abc',path:'/api/document-review/test',returnUrl:'https://wa.me/918136942531'});
 assert.ok(!h.includes('<script>'));assert.match(h,/&lt;script&gt;/);
 assert.match(h,/not acceptance/);assert.match(h,/required/);assert.match(h,/Opening the page does not approve/);
 assert.equal(safeRequestLogPath('/api/document-review/SECRET/content?x=1'),'/api/document-review/[redacted]');
});
