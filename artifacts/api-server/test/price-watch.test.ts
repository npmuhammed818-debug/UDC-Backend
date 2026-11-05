import {test} from 'node:test';import assert from 'node:assert/strict';import {priceWatchCommand,priceBelow} from '../src/marketData/priceWatch.ts';
test('price watch requires explicit asks and compares exact same-currency decimals',()=>{
 assert.deepEqual(priceWatchCommand('watch price below 500 USD'),{off:false,threshold:'500',currency:'USD'});assert.deepEqual(priceWatchCommand('price watch off'),{off:true});
 for(const x of ['he said watch price below 5 USD','watch price below -5 USD','watch price below 1,000 USD'])assert.equal(priceWatchCommand(x),null);
 assert.equal(priceBelow('499.99','500'),true);assert.equal(priceBelow('500','500'),false);assert.equal(priceBelow('0','5'),false);assert.equal(priceBelow('999999999999999.98','999999999999999.99'),true);
});
