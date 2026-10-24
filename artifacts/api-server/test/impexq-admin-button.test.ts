import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from 'esbuild';

// Isolated HTTP test: absolutely no real ImpexQ key, endpoint, or credentials.
test('phone-friendly ImpexQ admin test validates role, success, cooldown and safe failures', async () => {
  const state = {
    configured: true,
    calls: 0,
    status: 200,
    mock: false,
    key: 'private-test-secret-never-return',
  };
  (globalThis as any).__impexqAdminFixture = state;
  const output = fileURLToPath(new URL(`./impexq-button-${randomUUID()}.mjs`, import.meta.url));
  const bundled = await build({
    stdin: {
      contents: 'import express from "express";import router from "../src/routes/akifImpexq.ts";const app=express();app.use(express.json());app.use(router);export default app;',
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{
      name: 'impexq-only-mocks',
      setup(b) {
        b.onResolve({ filter: /./ }, args => {
          if (args.importer.endsWith('/routes/akifImpexq.ts') &&
              ['../auth/middleware', '../akif/intelligence/impexqClient'].includes(args.path))
            return { path: args.path, namespace: 'mock' };
        });
        b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
          loader: 'js',
          contents: args.path === '../auth/middleware'
            ? 'export const requireRole=role=>(req,res,next)=>{if(req.header("x-qa-role")!==role){res.status(403).json({error:"insufficient_permissions"});return;}req.authUser={id:req.header("x-qa-admin")||"qa-admin"};next();};'
            : `const s=globalThis.__impexqAdminFixture;
               export const isImpexqConfigured=()=>s.configured;
               export const getImpexqStatus=()=>({configured:s.configured,mode:"sandbox",productionReady:false});
               export const callImpexqSandbox=async()=>{throw Error("Unexpected sandbox call");};
               export const callImpexqFtaSandbox=async input=>{
                 s.calls++;
                 if(input.destination!=="uae"||input.query!=="basmati rice")throw Error("Unexpected input");
                 if(s.status!==200)throw Object.assign(Error("PROVIDER PRIVATE "+s.key),{providerStatus:s.status});
                 return {retrievedAt:"2026-10-24T00:00:00.000Z",mock:s.mock,
                   data:{_sandbox:true,_callsRemaining:498,untrustedSecret:s.key}};
               };`,
        }));
      },
    }],
  });
  await writeFile(output, bundled.outputFiles[0].text);
  let server: any;
  try {
    const { default: app } = await import(output);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (id: string, role = 'admin') => {
      const response = await fetch(base + '/admin/akif/impexq/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qa-admin': id, 'x-qa-role': role },
        body: '{}',
      });
      const data = await response.json();
      return { response, data };
    };
    let result = await request('qa-anonymous', 'buyer');
    assert.equal(result.response.status, 403);
    assert.equal(state.calls, 0, 'non-admin must never consume ImpexQ quota');

    state.configured = false;
    result = await request('qa-not-configured');
    assert.equal(result.response.status, 503);
    assert.equal(result.data.error, 'impexq_not_configured');
    assert.equal(state.calls, 0);
    state.configured = true;

    result = await request('qa-happy');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.ok, true);
    assert.equal(result.data.provider, 'impexq');
    assert.equal(result.data.mode, 'sandbox');
    assert.equal(result.data.productionReady, false);
    assert.equal(result.data.mock, false);
    assert.equal(result.data.callsRemaining, 498);
    assert.equal(state.calls, 1);
    assert.ok(!JSON.stringify(result.data).includes(state.key));

    result = await request('qa-happy');
    assert.equal(result.response.status, 429);
    assert.equal(result.data.error, 'test_cooldown');
    assert.ok(result.data.retryAfterSeconds > 0);
    assert.equal(state.calls, 1, 'cooldown must not consume provider quota');

    state.mock = true;
    result = await request('qa-simulated');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.mock, true);
    assert.match(result.data.message, /simulated/);
    state.mock = false;

    for (const [status, code] of [[401, 'key_rejected_or_inactive'], [403, 'key_rejected_or_inactive'],
      [429, 'provider_quota_or_rate_limit'], [500, 'provider_unavailable']] as const) {
      state.status = status;
      result = await request(`qa-provider-${status}`);
      assert.equal(result.response.status, 502);
      assert.equal(result.data.error, code);
      assert.ok(!JSON.stringify(result.data).includes(state.key));
      assert.equal(result.response.headers.get('cache-control'), 'no-store');
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await unlink(output);
    delete (globalThis as any).__impexqAdminFixture;
  }
});
