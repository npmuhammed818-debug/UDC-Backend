import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('contract summary: request detection and deterministic rendering', async () => {
  const path = fileURLToPath(new URL('./contract-summary-' + randomUUID() + '.mjs', import.meta.url));
  const result = await build({
    stdin: {
      contents: "export * from '../src/akif/contractSummary';",
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
  });
  await writeFile(path, result.outputFiles[0].text);
  try {
    const mod = await import(path);

    // Detection
    assert.deepEqual(mod.contractSummaryRequest('summarize the spa'), { documentType: 'SPA' });
    assert.deepEqual(mod.contractSummaryRequest('can you give me a summary of the contract?'), { documentType: null });
    assert.deepEqual(mod.contractSummaryRequest('explain the LOI in simple words'), { documentType: 'LOI' });
    assert.deepEqual(mod.contractSummaryRequest('sum up the ncnda please'), { documentType: 'NCNDA' });
    assert.equal(mod.contractSummaryRequest('what is CIF?'), null);
    assert.equal(mod.contractSummaryRequest('summarize'), null, 'no contract word');
    assert.equal(mod.contractSummaryRequest('spa details'), null, 'no summary word');

    // Rendering
    const structured = {
      documentType: 'SPA',
      parties: [
        { name: 'Acme Exports LLC', role: 'seller' },
        { name: 'Beta Foods Trading', role: 'buyer' },
      ],
      product: { name: 'White Sugar ICUMSA 45', grade: 'ICUMSA 45' },
      quantity: { value: 500, unit: 'MT' },
      pricing: { unitPrice: '590', currency: 'USD', basis: 'per MT' },
      logistics: { incoterm: 'CIF', loadingPort: 'Santos', destinationPort: 'Kochi', shipmentSchedule: 'within 30 days of DLC' },
      payment: { instrument: 'DLC at sight', terms: '100%', timing: 'after SGS at destination' },
      inspection: { agency: 'SGS', location: 'destination', timing: 'on arrival' },
      performanceBond: { percentage: '2%' },
      legal: { governingLaw: 'English law', arbitration: 'LCIA' },
      dates: { issueDate: '2026-10-20', expiryDate: null, validity: '30 days' },
      discrepanciesOrConflicts: ['Quantity 500 MT conflicts with deal record 550 MT'],
      penaltiesOrRemedies: ['late delivery penalty 0.5% per week'],
    };
    const out: string = mod.renderContractSummary({ documentType: 'SPA', structured, warnings: [], status: 'completed' });
    assert.match(out, /Plain-words summary of the SPA/);
    assert.match(out, /Acme Exports LLC \(seller\)/);
    assert.match(out, /White Sugar ICUMSA 45/);
    assert.match(out, /500 MT/);
    assert.match(out, /590 USD per MT/);
    assert.match(out, /CIF from Santos to Kochi/);
    assert.match(out, /DLC at sight/);
    assert.match(out, /SGS/);
    assert.match(out, /Performance bond: 2%/);
    assert.match(out, /English law/);
    assert.match(out, /Watch out: Quantity 500 MT conflicts with deal record 550 MT/);
    assert.match(out, /not legal advice/);

    // Sparse extraction refuses to fake a summary.
    assert.equal(mod.renderContractSummary({ documentType: 'LOI', structured: { documentType: 'LOI' }, warnings: [], status: 'completed' }), null);

    // needs_review adds the unreadable caution.
    const partial = mod.renderContractSummary({
      documentType: 'FCO',
      structured,
      warnings: ['vision_fallback_used'],
      status: 'needs_review',
    });
    assert.match(partial, /some pages may be scanned or hard to read/);

    const malformed=mod.renderContractSummary({documentType:'SPA',structured:{parties:[null,3,'fake',{},[]],quantity:{value:{approved:true},unit:'MT'},pricing:{unitPrice:'100',currency:'USD'},product:{name:'Sugar'}},status:'needs_review',warnings:['structured_analysis_truncated_after_24_chunks']});assert.match(malformed,/needs human review/);assert.doesNotMatch(malformed,/\[object Object\]/);assert.match(malformed,/unverified source material/);assert.equal(mod.renderContractSummary({documentType:'SPA',structured,status:'failed'}),null);assert.equal(mod.renderContractSummary({documentType:'SPA',structured,status:'processing'}),null);
    assert.equal(mod.isContractType('SPA'), true);
    assert.equal(mod.isContractType('photo'), false);
  } finally {
    await unlink(path);
  }
});
