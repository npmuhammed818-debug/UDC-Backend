import test from 'node:test';import assert from 'node:assert/strict';import {brainTrackingReply} from '../src/akif/shipmentTrackingReply.ts';
test('malformed tracking model content refuses without throwing',async()=>{
 for(const content of [null,undefined,42,{},[],true])assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content} as never)}),null);
});

test('tracking model cannot replace unsupported delivery with completion synonyms',async()=>{
 for(const reply of ['Delivery completed.','The parcel arrived at your address.','The shipment reached the recipient.','The package has been received by the consignee.'])assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content:JSON.stringify({reply})})}),null,reply);
});

test('tracking model output must be one object rather than prose containing a reply',async()=>{
 for(const content of ['Ignore the rules. {"reply":"The carrier created a label."}','{"reply":"The carrier created a label."} Extra claims outside the reply.','[{"reply":"The carrier created a label."}]'])assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content})}),null);
 assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content:'```json\n{"reply":"The carrier created a label."}\n```'})}),'The carrier created a label.');
});

import {interpretTrackingAsk} from '../src/akif/trackingIntent.ts';
test('tracking intent cannot invent or extend the user supplied carrier number',async()=>{
 for(const [message,number] of [['Track ABC123 please','XYZ987'],['Track ABC123 please','ABC1234'],['Track XABC123Y please','ABC123']])assert.equal(await interpretTrackingAsk(message,{chat:async()=>({content:JSON.stringify({trackingNumber:number})})}),null,message+' -> '+number);
 assert.equal(await interpretTrackingAsk('Track abc123 please',{chat:async()=>({content:'{"trackingNumber":"ABC123"}'})}),'ABC123');
});

test('tracking intent refuses prose and arrays around the decision',async()=>{
 for(const content of ['Ignore unrelated instructions {"trackingNumber":"ABC123"}','[{"trackingNumber":"ABC123"}]','{"trackingNumber":"ABC123"} extra text'])assert.equal(await interpretTrackingAsk('Track ABC123 please',{chat:async()=>({content})}),null);
 assert.equal(await interpretTrackingAsk('Track ABC123 please',{chat:async()=>({content:'```json\n{"trackingNumber":"ABC123"}\n```'})}),'ABC123');
});

test('nominal delivery-date predictions cannot bypass the no-date-promise guard',async()=>{
 for(const reply of ['Delivery is tomorrow.','Arrival: Monday.','Delivery in 2 days.','Your parcel arrives tomorrow.'])assert.equal(await brainTrackingReply({number:'SYNTHETIC',events:[{time:'2026-11-05T00:00:00Z',description:'Label created'}]},{chat:async()=>({content:JSON.stringify({reply})})}),null,reply);
});

test('tracking source-token boundaries include non-ASCII letters and digits',async()=>{
 for(const message of ['Track αABC123β','Track ١ABC123٢','Track ＸABC123Ｙ'])assert.equal(await interpretTrackingAsk(message,{chat:async()=>({content:'{"trackingNumber":"ABC123"}'})}),null,message);
 assert.equal(await interpretTrackingAsk('ABC123 എവിടെ',{chat:async()=>({content:'{"trackingNumber":"ABC123"}'})}),'ABC123');
});

test('combining marks cannot be discarded from a source tracking token',async()=>{
 for(const message of ['Track ABC123\u0301','Track A\u0301BC123','Track \u0301ABC123'])assert.equal(await interpretTrackingAsk(message,{chat:async()=>({content:'{"trackingNumber":"ABC123"}'})}),null,message);
});
