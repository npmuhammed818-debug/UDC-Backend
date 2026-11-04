import {test} from 'node:test';import assert from 'node:assert/strict';
import {dealProgress,statusPicture} from '../src/deals/statusPicture.ts';
test('recorded stages are never proof of payment/delivery, paused/unknown lose progress',()=>{
 assert.equal(dealProgress('shipment').stage,'Shipping');assert.equal(dealProgress('completed').complete,true);
 for(const s of ['cancelled','on_hold','disputed','unrecognized'])assert.ok(dealProgress(s).stages.every(v=>v.state==='unconfirmed'));
 const svg=statusPicture({dealNumber:'<script>bad</script>',status:'banking',asOf:'2026-11-04T20:00:00Z'});assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);assert.match(svg,/Not payment or delivery confirmation/);
});
