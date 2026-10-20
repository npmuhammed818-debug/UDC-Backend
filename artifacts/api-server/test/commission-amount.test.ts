import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommissionAmount } from '../src/referrals/commissionAmount.ts';

test('commission uses expressly supplied rules and exact decimal arithmetic',()=>{
  assert.equal(calculateCommissionAmount({method:'percentage',quantity:'100.000000',unit:'MT',agreedPrice:'5900.00',rate:'1.25'}),'7375.00');
  assert.equal(calculateCommissionAmount({method:'fixed_per_mt',quantity:'12.345678',unit:'MT',agreedPrice:'999',rate:'2.5'}),'30.86');
  assert.equal(calculateCommissionAmount({method:'percentage',quantity:'0.3',unit:'kg',agreedPrice:'10.00',rate:'10'}),'0.30');
  assert.equal(calculateCommissionAmount({method:'fixed_amount',quantity:'1',unit:'MT',agreedPrice:'1',amount:'1.005'}),'1.01');
  assert.equal(calculateCommissionAmount({method:'fixed_amount',quantity:'1',unit:'MT',agreedPrice:'1',amount:'9999999999999999.99'}),'9999999999999999.99');
});

test('commission never invents rates, converts unknown units or accepts invalid/overflowing amounts',()=>{
  const base={quantity:'100',unit:'MT',agreedPrice:'5900'};
  assert.throws(()=>calculateCommissionAmount({...base,method:'percentage'}),/rate_required/);
  assert.throws(()=>calculateCommissionAmount({...base,method:'fixed_per_mt',rate:10,unit:'kg'}),/requires_mt/);
  assert.throws(()=>calculateCommissionAmount({...base,method:'percentage',rate:101}),/percentage/);
  for(const amount of ['0','-1','Infinity','1e5','1,000','10000000000000000.00'])assert.throws(()=>calculateCommissionAmount({...base,method:'fixed_amount',amount}));
});
