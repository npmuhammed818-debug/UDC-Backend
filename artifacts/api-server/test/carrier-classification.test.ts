import test from 'node:test';import assert from 'node:assert/strict';import {classifyCarrierDescription as classify} from '../src/tracking/classifyCarrierEvent.ts';import {trackingReplyViolatesRules} from '../src/akif/shipmentTrackingReply.ts';
test('negative and uncertain delivery lines cannot become positive delivery notifications',()=>{
 for(const description of ['Not delivered','Shipment not delivered yet','Unable to deliver','Delivery pending','Out for delivery','Proof of delivery unavailable','Expected delivery tomorrow','Not shipped','Awaiting dispatch','Scheduled delivery','Cannot deliver','Delivery not confirmed','Not in transit','Not picked up','Not left origin','Delivery failed','Shipping unsuccessful','Departed status unconfirmed']){assert.equal(classify(description),null,description);assert.equal(trackingReplyViolatesRules('The shipment was delivered.',[{time:'2026-11-05T00:00:00Z',description}]),true,description);}
});
test('explicit shipment and carrier delay lines retain conservative classes',()=>{
 assert.equal(classify('Package delivered to consignee'),'delivered');assert.equal(classify('Departed from origin facility'),'shipped');assert.equal(classify('Customs hold at destination'),'delayed');assert.equal(classify('Label created'),null);
});

test('resolved or explicitly absent delays are not promoted to a delay alert',()=>{for(const text of ['No delay reported','Not delayed','Exception resolved','Customs hold cleared','Without exception'])assert.equal(classify(text),null,text);});


test('brain cannot invent a departure or transit from a label or unresolved event',()=>{
 for(const description of ['Label created','Not shipped','Awaiting dispatch','Delivery pending','Delivered to consignee'])for(const reply of ['Your shipment has shipped.','The cargo departed.','Your parcel was picked up.','It is in transit.','It was dispatched.'])assert.equal(trackingReplyViolatesRules(reply,[{time:'2026-11-05T00:00:00Z',description}]),true,description+': '+reply);
 assert.equal(trackingReplyViolatesRules('The carrier reports it is in transit. UDC has not verified it.',[{time:'2026-11-05T00:00:00Z',description:'Departed origin facility'}]),false);
});


test('planned, conditional and question text is not an accomplished carrier event',()=>{
 for(const text of ['Will be delivered tomorrow','May be delivered','Should be shipped today','Could be dispatched','Please confirm delivered','Delivered?','Ready for dispatch','Waiting for pickup','Delivery requested','Due to depart tomorrow'])assert.equal(classify(text),null,text);
});

test('return-to-sender, pickup-point and ambiguous left text are not final delivery or departure',()=>{
 for(const text of ['Delivered to sender','Delivered back to shipper','Returned to sender, delivered','Delivered to pickup point, available for collection','Delivered to local post office','Left message for recipient','Left at reception','Customer left instructions','The left door is damaged','Proof of delivery document uploaded'])assert.equal(classify(text),null,text);
 assert.equal(classify('Shipment left origin facility'),'shipped');
 assert.equal(classify('Parcel delivered to consignee'),'delivered');
});

test('carrier and partner handoffs or conditional delivery text do not establish final delivery',()=>{
 for(const text of ['Delivered to local carrier','Delivered to delivery partner','Delivered to destination sorting hub','Delivered to customs office','Delivered to parcel locker, awaiting collection','If delivered, tracking will update','Delivery has been delivered to carrier for onward transport']){
  assert.equal(classify(text),null,text);
  assert.equal(trackingReplyViolatesRules('Your parcel was delivered.',[{time:'2026-11-05T00:00:00Z',description:text}]),true,text);
 }
});

test('status substrings inside unrelated words are not shipment events',()=>{
 for(const text of ['Tracking data withheld','An unexceptional tracking record','Status code: undeparted','Status code: undispatched','Shipment predelayed flag'])assert.equal(classify(text),null,text);
});
