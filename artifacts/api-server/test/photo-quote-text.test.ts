import test from 'node:test';
import assert from 'node:assert/strict';
import {photoQuoteText} from '../src/deals/photoQuoteText.ts';
test('photo text preserves exact price and full product suffix with review caveat',()=>{
 const product='A'.repeat(110)+' grade XYZ';
 const text=photoQuoteText({dealNumber:'UDC-SYNTHETIC',items:[{product,unitPrice:'900719925474099.000001',currency:'USD',unit:'carton'}],notice:'Unverified extraction. No seller matched or order created.'});
 assert.ok(text.includes(product+': 900719925474099.000001 USD per carton'));
 assert.match(text,/1 unverified extracted price-list rows/);
 assert.match(text,/No seller matched or order created/);
});
test('photo text calls out omitted rows and keeps unverified source caveat',()=>{
 const items=Array.from({length:9},(_,i)=>({product:'Product '+(i+1),unitPrice:'123.000001',currency:'USD',unit:'carton'}));
 const text=photoQuoteText({dealNumber:'UDC-SYNTHETIC',items,notice:'Check every row against the original photo. No order created.'});
 assert.match(text,/9 unverified extracted/);assert.match(text,/Product 8:/);assert.doesNotMatch(text,/Product 9:/);
 assert.match(text,/Additional rows omitted/);assert.match(text,/Check every row against the original photo/);
});
