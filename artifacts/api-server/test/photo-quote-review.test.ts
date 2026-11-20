import test from 'node:test';import assert from 'node:assert/strict';
// Pure parsing lives separately from SQL to keep numeric/source tests isolated.
import {photoQuoteLines} from '../src/deals/photoQuoteLines.ts';
const row={product:'Chocolate 100g',unitPrice:'123.000001',currency:'USD',unit:'carton'};
test('photo quote keeps exact decimal strings and original explicit units',()=>{assert.deepEqual(photoQuoteLines({items:[row]}),[row]);});
test('photo quote refuses ambiguous numbers, missing currency/unit, overflow and too many items',()=>{for(const patch of [{unitPrice:123},{unitPrice:'1,200'},{unitPrice:'1e3'},{unitPrice:'0.000000'},{unitPrice:'9007199254740992'},{currency:'$'},{unit:'box'},{product:''}])assert.equal(photoQuoteLines({items:[{...row,...patch}]}),null);assert.equal(photoQuoteLines({items:Array(31).fill(row)}),null);assert.equal(photoQuoteLines(null),null);});

test('photo rows refuse line breaks, display-direction overrides and controls',()=>{for(const product of ['Chocolate\nSeller matched','Chocolate\u202e321','Chocolate\u0000','Chocolate\u2066USD'])assert.equal(photoQuoteLines({items:[{...row,product}]}),null);});

test('photo rows refuse Unicode line and paragraph separators',()=>{
 for(const product of ['Chocolate\u2028Seller matched','Chocolate\u2029Seller matched'])assert.equal(photoQuoteLines({items:[{...row,product}]}),null);
});
