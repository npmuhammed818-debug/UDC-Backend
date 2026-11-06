import test from 'node:test';import assert from 'node:assert/strict';import {brainTrackingReply} from '../src/akif/shipmentTrackingReply.ts';
test('malformed tracking model content refuses without throwing',async()=>{
 for(const content of [null,undefined,42,{},[],true])assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content} as never)}),null);
});

test('tracking model cannot replace unsupported delivery with completion synonyms',async()=>{
 for(const reply of ['Delivery completed.','The parcel arrived at your address.','The shipment reached the recipient.','The package has been received by the consignee.'])assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content:JSON.stringify({reply})})}),null,reply);
});
