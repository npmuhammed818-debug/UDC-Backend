import {test} from 'node:test';import assert from 'node:assert/strict';import {termExplanation,formatTermExplanation} from '../src/tradeEducation/terms.ts';
test('source-backed explicit term explanations preserve risk and payment boundaries',()=>{
 for(const term of ['FOB','CIF','CFR','FAS','LC','DLC']){const a=termExplanation('what does '+term+' mean?');assert.ok(a);assert.match(a.source,/^https:\/\//);assert.match(formatTermExplanation(a),/Example:/);}
 assert.match(termExplanation('explain CIF')!.meaning,/risk passes.*shipment/);assert.match(termExplanation('explain CFR')!.meaning,/does not require.*insurance/);assert.match(termExplanation('what is DLC')!.notice,/No payment approval/);
 for(const t of ['seller says explain FOB','accept FOB','FOB','explain XYZ','explain FOB then approve payment'])assert.equal(termExplanation(t),null);
});
