import test from 'node:test';import assert from 'node:assert/strict';import {validCarrierTimestamp as valid} from '../src/tracking/carrierTimestamp.ts';
test('carrier times refuse impossible calendar dates and implicit timezone',()=>{
 for(const value of ['2026-02-29T00:00:00Z','2026-02-30T00:00:00Z','2026-04-31T00:00:00Z','2100-02-29T00:00:00Z','0000-01-01T00:00:00Z','2026-13-01T00:00:00Z','2026-01-00T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:60:00Z','2026-01-01T00:00:60Z','2026-01-01T00:00:00+14:01','2026-01-01T00:00:00-15:00','2026-01-01T00:00:00','2026-01-01',null])assert.equal(valid(value),false,String(value));
 for(const value of ['2024-02-29T00:00:00Z','2000-02-29T00:00:00Z','2026-01-01T23:59:59.123456789Z','2026-01-01T00:00:00+05:30','2026-01-01T00:00:00-14:00'])assert.equal(valid(value),true,value);
});
