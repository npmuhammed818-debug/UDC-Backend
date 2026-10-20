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
    assert.equal(report.results[0].reason,'model_request_failed'); assert.equal(report.results[0].httpStatus,502);
    assert.doesNotMatch(stdout+stderr,/synthetic-token|synthetic_unavailable/);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('live acceptance distinguishes model schema errors without logging model text', async () => {
  const content=JSON.stringify({role:'buyer',newIntake:true,fields:{product:'PRIVATE_MODEL_TEXT',quantity:'100 MT'},reply:'I’ll send this for review.'});
  const server=createServer((req,res)=>{req.resume();res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content}}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const child=spawn(process.execPath,[fileURLToPath(new URL('../acceptance/live-intake.mjs',import.meta.url))],{env:{PATH:process.env.PATH,AKIF_WORKER_URL:`http://127.0.0.1:${(server.address() as any).port}`,AKIF_WORKER_TOKEN:'synthetic-token'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
    const timeout=setTimeout(()=>child.kill('SIGKILL'),20_000);const code=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timeout);
    assert.equal(code,1);assert.doesNotMatch(output,/PRIVATE_MODEL_TEXT|synthetic-token/);
    const line=output.split('\n').find(s=>s.startsWith('UDC_ACCEPTANCE_RESULT '))!;
    const result=JSON.parse(line.slice('UDC_ACCEPTANCE_RESULT '.length)).results[0];
    assert.equal(result.reason,'invalid_schema');assert.equal(result.httpStatus,null);assert.equal(result.shape.startsJson,true);
    assert.deepEqual(result.issues,[{code:'invalid_type',path:['fields','quantity']}]);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
