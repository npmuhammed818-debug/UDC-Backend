import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Minimal Pink-Sheet-shaped XLSX fixture: columns "Sugar, world" ($/kg) and
// "Rice, Thai 5% " ($/mt); months 2025M08, 2026M08, 2026M09.
const FIXTURE_XLSX_B64 = 'UEsDBBQAAAAIANwOYV2WDB/5pwAAAAEBAAAPAAAAeGwvd29ya2Jvb2sueG1sjY87DoMwDIavEvkADWXogHgsXRgq9QopmCaCxJGdvm7fCMreybY+/Z/tunv7RT2RxVFo4HgooGvrF/F8I5pVhkEasCnFSmsZLHojB4oYMpmIvUl55LuWyGhGsYjJL7osipP2xgXYDBX/46BpcgOeaXh4DGmTMC4m5dPEuijQ1usG+VUVjMcGLhSSXT7qyjkuoFbWjw2UoLhyueF+LEG3td7jev+w/QJQSwMEFAAAAAgA3A5hXR3wJZ6GAAAAugAAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1VOOQ7DMAz7iqEHRG6GDkXszFmLfMBIVDvIYUMSevy+RqdmIkUSFLv+vW/mSSxLPhxcGgu97+60Ba2CpKWIqYlDHCTVckOUKdEepMmFjuo8Mu9B68kRS5jWEAlba6/I/x1w7jTD7ICHuQUzfgo50EoCR1IHr8yrJCIV/EHb1C+AvsPTKv8FUEsDBBQAAAAIANwOYV1PaSEY8QAAAKwCAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDIueG1sdZLhboMgFEZfxfAAgFZUFqRZuxchjs2mRQwQu8cf05bcEfuDBO53OPeGII4/5lYs2vmLnXpUYoqOUtytu/pR61DEdPI9GkOY3wjxw6iN8tjOeorJl3VGhXh038TPTqvP9ZK5kYrShhh1mZAUa+1DBSWFs/fCxS6xOvxt3ktUhB75eF4kFWSRggxxRS7BdYJrAJf7MEswA3CV4DU7wezwPzvDrN5v0jybnBoAs0wEs2Zf1KZpWwC32bTt9jq4zhpsdUYpfvFyXdJ3QN9l+u6hP2TBeQtY9dLPk58DP8/8/Dl+mfn5Y36GWeYn4MuQ9BflL1BLAwQUAAAACADcDmFdW1HSBNoAAACIAQAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1sdZDdSgMxEEZfZVgUKixNXOiikqag3orFVno9bsZN6CZZkvHv7c3ihbDVy+98M8Nh1ObTD/BOKbsY1tXlUlYbrXJmKDzkdWWZxxshcmfJY17GkUJpXmPyyCWmXuQxEZpsidgPopGyFR5dqMoZpxXrQ0yDgVsMR7iL3kfj+Au2yXUE98gIi70l2LpS76YbF0qwVmLa/dl/Hg0yGYgBHjuOL5RANjU0smnno/O8e+sx1fAxGcy7pyJQw96ig9U5zNvFmTj2JyqF+lPBYrJ6kFd/4PZffP2LRfm2/gZQSwECFAMUAAAACADcDmFdlgwf+acAAAABAQAADwAAAAAAAAAAAAAAgAEAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQDFAAAAAgA3A5hXR3wJZ6GAAAAugAAABoAAAAAAAAAAAAAAIAB1AAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQDFAAAAAgA3A5hXU9pIRjxAAAArAIAABgAAAAAAAAAAAAAAIABkgEAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbFBLAQIUAxQAAAAIANwOYV1bUdIE2gAAAIgBAAAUAAAAAAAAAAAAAACAAbkCAAB4bC9zaGFyZWRTdHJpbmdzLnhtbFBLBQYAAAAABAAEAA0BAADFAwAAAAA=';

async function bundle() {
  const path = fileURLToPath(new URL('./commodity-translation-' + randomUUID() + '.mjs', import.meta.url));
  const result = await build({
    stdin: {
      contents: "export * from '../src/akif/intelligence/commodityPrices'; export * from '../src/akif/textTranslation';",
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{
      name: 'fixtures',
      setup(b: any) {
        b.onResolve({ filter: /hermesClient(\.ts)?$/ }, (a: any) => ({ path: a.path, namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: "export const runConversationChat=async(m,s,t)=>{const st=globalThis.__ct;st.calls.push({message:m,system:s});if(st.fail)throw Error('MODEL_DOWN');return {content:st.reply};};",
        }));
      },
    }],
  });
  await writeFile(path, result.outputFiles[0].text);
  return path;
}

test('commodity reference: parser, aliases, detection, evidence answer', async () => {
  (globalThis as any).__ct = { calls: [], reply: null, fail: false };
  const path = await bundle();
  try {
    const mod = await import(path);
    const fixture = Buffer.from(FIXTURE_XLSX_B64, 'base64');

    const table = mod.parsePinkSheet(fixture);
    assert.equal(table.updatedOn, 'October 02, 2026');
    const cols = [...table.columns.values()].map((c: any) => c.name + '|' + c.unit);
    assert.ok(cols.includes('Sugar, world|$/kg'), JSON.stringify(cols));
    assert.ok(cols.includes('Rice, Thai 5%|$/mt'));
    assert.equal(table.dataRows[0].period, '2026M09');

    assert.equal(mod.resolveCommoditySeries('what is the sugar price today?'), 'Sugar, world');
    assert.equal(mod.resolveCommoditySeries('current palm oil rate'), 'Palm oil');
    assert.equal(mod.resolveCommoditySeries('arabica coffee price'), 'Coffee, Arabica');
    assert.equal(mod.resolveCommoditySeries('cardamom price'), null);
    assert.equal(mod.resolveCommoditySeries('what is the oil price?'), null, 'bare oil is ambiguous');

    assert.equal(mod.commodityReferenceQuery('what is the sugar price?'), 'Sugar, world');
    assert.equal(mod.commodityReferenceQuery('100 MT copper at 5900'), null, 'offer text is not a price question');
    assert.equal(mod.commodityReferenceQuery('sugar'), null);
    assert.equal(mod.commodityReferenceQuery('price'), null);

    // Evidence fetch: page HTML without a link falls back to the pinned file.
    const calls: string[] = [];
    (globalThis as any).fetch = async (url: string) => {
      calls.push(url);
      if (url.includes('commodity-markets')) return new Response('no link here');
      return new Response(fixture);
    };
    const ref = await mod.getCommodityReference('Sugar, world');
    assert.equal(ref.provider, 'world_bank_pink_sheet');
    assert.equal(ref.period, '2026M09');
    assert.equal(ref.price, 0.41);
    assert.equal(ref.previousPrice, 0.38);
    assert.equal(ref.yearAgoPrice, 0.4);
    assert.ok(ref.limitations.length >= 2);
    const answer: string = mod.commodityReferenceAnswer(ref);
    assert.match(answer, /0\.41 USD per kg/);
    assert.match(answer, /Sep 2026/);
    assert.match(answer, /up/);
    assert.match(answer, /not a live deal quote/);
    assert.equal(calls.length, 2);

    // Cache: a second call within TTL makes no new fetches.
    const again = await mod.getCommodityReference('Rice, Thai 5%');
    assert.equal(again.price, 505.5);
    assert.match(again.unit, /mt/);
    assert.equal(calls.length, 2, 'cache hit');
  } finally {
    await unlink(path);
  }
});

test('translation: request parsing, output checks, translate', async () => {
  (globalThis as any).__ct = { calls: [], reply: null, fail: false };
  const path = await bundle();
  try {
    const mod = await import(path);
    assert.deepEqual(mod.parseTranslateRequest('translate CIF Kochi port 500 MT at 5900 to malayalam'),
      { language: 'malayalam', content: 'CIF Kochi port 500 MT at 5900' });
    assert.deepEqual(mod.parseTranslateRequest('translate to tamil: payment by DLC at sight'),
      { language: 'tamil', content: 'payment by DLC at sight' });
    assert.deepEqual(mod.parseTranslateRequest('Translate into Arabic: the goods ship next week'),
      { language: 'arabic', content: 'the goods ship next week' });
    assert.equal(mod.parseTranslateRequest('translate this'), null);
    assert.equal(mod.parseTranslateRequest('translate hello to klingon'), null);
    assert.equal(mod.parseTranslateRequest('what is CIF?'), null);
    assert.equal(mod.parseTranslateRequest('translate sugar price to malayalam please'), null, 'no inline content boundary');

    assert.equal(mod.translatedTextOk('സുഗന്ധി', 'hello', 'malayalam'), true);
    assert.equal(mod.translatedTextOk('', 'hello', 'malayalam'), false);
    assert.equal(mod.translatedTextOk('hello', 'hello', 'malayalam'), false, 'untranslated echo');
    assert.equal(mod.translatedTextOk('Sorry, I cannot do that', 'hello', 'malayalam'), false);
    assert.equal(mod.translatedTextOk('TRADE_ACTION', 'hello', 'malayalam'), false);
    assert.equal(mod.translatedTextOk('x'.repeat(4001), 'hello', 'malayalam'), false);

    const st = (globalThis as any).__ct;
    st.reply = 'കൊച്ചി പോർട്ട് 500 MT';
    const out = await mod.translateTradeText({ language: 'malayalam', content: 'Kochi port 500 MT' });
    assert.equal(out, 'കൊച്ചി പോർട്ട് 500 MT');
    assert.match(st.calls.at(-1).system, /ONLY the translation/);
    assert.equal(st.calls.at(-1).message, 'Kochi port 500 MT');
    st.reply = 'Kochi port 500 MT';
    assert.equal(await mod.translateTradeText({ language: 'malayalam', content: 'Kochi port 500 MT' }), null);
    st.fail = true;
    assert.equal(await mod.translateTradeText({ language: 'tamil', content: 'hello seller' }), null);
  } finally {
    await unlink(path);
  }
});
