import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { freeTtsEnabled } from '../src/akif/freeTts.ts';

test('free TTS is off by default and on only with AKIF_FREE_TTS=on', () => {
  assert.equal(freeTtsEnabled({}), false);
  assert.equal(freeTtsEnabled({ AKIF_FREE_TTS: 'off' }), false);
  assert.equal(freeTtsEnabled({ AKIF_FREE_TTS: 'on' }), true);
});

test('speech synthesis uses the free voice only when the paid worker is absent and the flag is on', async () => {
  const output = fileURLToPath(new URL(`./tts-${randomUUID()}.mjs`, import.meta.url));
  const out = await build({
    stdin: { contents: "export { synthesizeAkifSpeechTimed } from '../src/akif/intelligence/workerClient';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'tts-fixture', setup(b) {
      b.onResolve({ filter: /freeTts\.ts$/ }, () => ({ path: 'freeTts', namespace: 'fixture' }));
      b.onResolve({ filter: /voiceLanguage\.ts$/ }, () => ({ path: 'voiceLanguage', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
        contents: args.path === 'freeTts'
          ? "export const freeTtsEnabled=()=>process.env.AKIF_FREE_TTS==='on';export const synthesizeFreeTts=async(text,language)=>({bytes:new TextEncoder().encode('OGG:'+language+':'+text),seconds:null});"
          : "export const normalizeVoiceLanguage=(x)=>({mal:'malayalam',english:'english'}[x]??null);",
      }));
    } }],
  });
  await writeFile(output, out.outputFiles[0].text);
  try {
    const m = await import(output);
    delete process.env.AKIF_WORKER_URL; delete process.env.AKIF_WORKER_TOKEN;
    process.env.AKIF_FREE_TTS = 'off';
    await assert.rejects(() => m.synthesizeAkifSpeechTimed('hello', false, 'english'), /akif_speech_not_configured/);
    process.env.AKIF_FREE_TTS = 'on';
    const r = await m.synthesizeAkifSpeechTimed('nalla sambhavam', false, 'mal');
    assert.equal(new TextDecoder().decode(r.bytes), 'OGG:malayalam:nalla sambhavam');
  } finally { delete process.env.AKIF_FREE_TTS; await unlink(output); }
});
