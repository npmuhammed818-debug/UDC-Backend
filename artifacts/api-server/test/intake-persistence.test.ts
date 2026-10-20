import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mergeBuyerRequirementDraft, mergeSellerOfferDraft } from '../src/akif/intakeDraftMerge.ts';

test('optional trade terms survive follow-ups without asking for essentials again', () => {
  const buyer = mergeBuyerRequirementDraft({ product: 'Sugar', quantity: 100, targetPrice: 500, destination: 'Mombasa', specification: 'ICUMSA 45', deliveryTime: '30 days', contractDuration: '12 months', inspectionRequirements: 'SGS at destination' }, { targetPrice: 510, missingFields: [] }, '');
  assert.equal(buyer.specification, 'ICUMSA 45');
  assert.equal(buyer.deliveryTime, '30 days');
  assert.equal(buyer.contractDuration, '12 months');
  assert.equal(buyer.inspectionRequirements, 'SGS at destination');
  assert.equal(buyer.targetPrice, 510);
  assert.deepEqual(buyer.missingFields, []);
  const seller = mergeSellerOfferDraft({ product: 'Sugar', quantity: 100, price: 500, specification: 'ICUMSA 45', availability: 'Ready in 14 days', monthlyCapacity: 1000, minimumOrderQuantity: 50, inspectionTerms: 'SGS' }, { price: 490, missingFields: [] });
  assert.equal(seller.availability, 'Ready in 14 days');
  assert.equal(seller.monthlyCapacity, 1000);
  assert.equal(seller.minimumOrderQuantity, 50);
  assert.equal(seller.specification, 'ICUMSA 45');
  assert.equal(seller.inspectionTerms, 'SGS');
  assert.deepEqual(seller.missingFields, []);
});

test('real intake writers persist supplied terms and keep fixed payment policy and review status', async () => {
  const key = `__intake_${randomUUID().replaceAll('-', '')}`;
  const state: any = { writes: [] };
  (globalThis as any)[key] = state;
  const output = fileURLToPath(new URL(`./intake-record-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ stdin: { contents: `export * from './src/akif/recordBuyerRequirement'; export * from './src/akif/recordPendingSellerOffer';`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, plugins: [{ name: 'isolated-records', setup(b) {
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      const state = globalThis[${JSON.stringify(key)}];
      const table = name => ({name, phone: name + '.phone'});
      export const usersTable = table('users'), productsTable = table('products'), buyerRequestsTable = table('buyer'), sellerListingsTable = table('seller');
      export const db = {
        select: () => ({from: () => ({where: () => ({limit: async () => [{id:'product'}]})})}),
        insert: t => ({values: input => {
          state.writes.push({table:t.name, input});
          const query = {onConflictDoUpdate: () => query, returning: async () => [{id:t.name, status:input.status}]};
          return query;
        }})
      };` }));
    b.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: 'orm', namespace: 'orm' }));
    b.onLoad({ filter: /.*/, namespace: 'orm' }, () => ({ contents: 'export const eq = () => true;' }));
  } }] });
  await writeFile(output, result.outputFiles[0].text);
  try {
    const { recordPendingBuyerRequirement, recordPendingSellerOffer, buyerIntakeSchema, sellerOfferSchema } = await import(output);
    await recordPendingBuyerRequirement(buyerIntakeSchema.parse({phone:'00000000001', fullName:'Synthetic Buyer', product:'Sugar', quantity:100, targetPrice:500, destination:'Mombasa', specification:'ICUMSA 45', deliveryTime:'30 days', contractDuration:'12 months', inspectionRequirements:'SGS'}));
    await recordPendingSellerOffer(sellerOfferSchema.parse({phone:'00000000002', fullName:'Synthetic Seller', product:'Sugar', quantity:100, price:490, specification:'ICUMSA 45', availability:'14 days', monthlyCapacity:1000, minimumOrderQuantity:50, inspectionTerms:'SGS'}));
    const buyer = state.writes.find((w: any) => w.table === 'buyer').input;
    const seller = state.writes.find((w: any) => w.table === 'seller').input;
    assert.equal(buyer.specification, 'ICUMSA 45');
    assert.equal(buyer.additionalConditions, 'Requested delivery: 30 days');
    assert.equal(buyer.contractDuration, '12 months');
    assert.equal(buyer.inspectionRequirements, 'SGS');
    assert.equal(seller.monthlyCapacity, '1000');
    assert.equal(seller.minimumOrderQuantity, '50');
    assert.equal(seller.availability, '14 days');
    assert.equal(seller.inspectionTerms, 'SGS');
    for (const row of [buyer, seller]) {
      assert.equal(row.status, 'pending_admin_review');
      assert.match(row.paymentTerms, /DLC/);
      assert.match(row.paymentTerms, /SGS/);
    }
  } finally { delete (globalThis as any)[key]; await unlink(output); }
});
