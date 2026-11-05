import test from 'node:test';import assert from 'node:assert/strict';import {classifyCarrierDescription as classify} from '../src/tracking/classifyCarrierEvent.ts';import {trackingReplyViolatesRules} from '../src/akif/shipmentTrackingReply.ts';
test('negative and uncertain delivery lines cannot become positive delivery notifications',()=>{
 for(const description of ['Not delivered','Shipment not delivered yet','Unable to deliver','Delivery pending','Out for delivery','Proof of delivery unavailable','Expected delivery tomorrow','Not shipped','Awaiting dispatch','Scheduled delivery','Cannot deliver','Delivery not confirmed','Not in transit','Not picked up','Not left origin','Delivery failed','Shipping unsuccessful','Departed status unconfirmed']){assert.equal(classify(description),null,description);assert.equal(trackingReplyViolatesRules('The shipment was delivered.',[{time:'2026-11-05T00:00:00Z',description}]),true,description);}
});
test('explicit shipment and carrier delay lines retain conservative classes',()=>{
 assert.equal(classify('Package delivered to consignee'),'delivered');assert.equal(classify('Departed from origin facility'),'shipped');assert.equal(classify('Customs hold at destination'),'delayed');assert.equal(classify('Label created'),null);
});

test('resolved or explicitly absent delays are not promoted to a delay alert',()=>{for(const text of ['No delay reported','Not delayed','Exception resolved','Customs hold cleared','Without exception'])assert.equal(classify(text),null,text);});
