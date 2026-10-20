import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('live acceptance stops after provider failure without retries or paid fallbacks', async () => {
  let calls = 0;
  const server = createServer((req,res) => {
    calls++;
    assert.equal(req.url, '/chat/completions');
    assert.equal(req.headers['x-akif-worker-token'], 'synthetic-token');
    req.resume();
    res.writeHead(502, {'content-type':'application/json'});res.end('{"error":"synthetic_unavailable"}');
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address() as {port:number};
  try {
    const child = spawn(process.execPath,[fileURLToPath(new URL('../acceptance/live-intake.mjs',import.meta.url))],{
      env:{PATH:process.env.PATH,AKIF_WORKER_URL:`http://127.0.0.1:${address.port}`,AKIF_WORKER_TOKEN:'synthetic-token'},
      stdio:['ignore','pipe','pipe'],
    });
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);
    child.stderr.on('data',chunk=>stderr+=chunk);
    const timeout=setTimeout(()=>child.kill('SIGKILL'),20_000);
    const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timeout);
    assert.equal(code,1);
    assert.equal(calls,1);
    const line=stdout.split('\n').find(s=>s.startsWith('UDC_ACCEPTANCE_RESULT '))!;
    const report=JSON.parse(line.slice('UDC_ACCEPTANCE_RESULT '.length));
    assert.equal(report.calls,1);assert.equal(report.budget,5);
    assert.equal(report.results[0].status,'blocked');
    assert.doesNotMatch(stdout+stderr,/synthetic-token|synthetic_unavailable/);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
