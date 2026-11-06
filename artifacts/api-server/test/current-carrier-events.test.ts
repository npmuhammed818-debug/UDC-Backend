import test from 'node:test';import assert from 'node:assert/strict';
import {currentCarrierEvents} from '../src/tracking/currentCarrierEvents.ts';
const now=new Date('2026-11-05T12:00:00Z');
test('runtime carrier feed shapes refuse without throwing',()=>{
 const event={time:'2026-11-05T00:00:00Z',description:'Delivered to consignee'};
 for(const input of [null,{},'invalid',[{...event,location:123}],[{...event,location:{}}],[null],[42]]){
  assert.equal(currentCarrierEvents(input as never,now),null,JSON.stringify(input));
 }
 assert.deepEqual(currentCarrierEvents([event],now),[event]);
});
