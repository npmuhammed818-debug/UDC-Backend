import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('media acceptance uses only fixed synthetic files and bounded isolated endpoints',async()=>{
  const seen:string[]=[];
  const server=createServer((req,res)=>{
    const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
      const body=Buffer.concat(chunks);seen.push(req.url!);let result:any;
      if(req.url==='/media/image/transcribe'){
        assert.equal(req.headers['x-akif-worker-token'],'synthetic-worker');const input=JSON.parse(body.toString());assert.equal(input.mime_type,'image/png');assert.ok(Buffer.from(input.base64,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
        result={text:'Copper cathode 100 MT USD 5900 Jebel Ali',human_review_required:true};
      } else if(req.url==='/media/audio/transcribe'){
        assert.equal(req.headers['x-akif-worker-token'],'synthetic-worker');assert.ok(body.includes(Buffer.from('RIFF')));result={text:'Copper cathode one hundred metric tons',requires_confirmation:true};
      } else {
        assert.equal(req.url,'/extract');assert.equal(req.headers.authorization,'Bearer synthetic-extractor');assert.ok(body.includes(Buffer.from('%PDF')));result={text:'Copper cathode 100 MT USD 5900 Jebel Ali'};
      }
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${(server.address() as any).port}`;
    // Test-only preload advances the fixed cooldown; production has no bypass flag.
    const preload='data:text/javascript,'+encodeURIComponent('const original=globalThis.setTimeout;globalThis.setTimeout=(callback,ms,...args)=>original(callback,ms===65000?0:ms,...args);');
    const child=spawn(process.execPath,['--import',preload,fileURLToPath(new URL('../acceptance/live-media.mjs',import.meta.url))],{env:{PATH:process.env.PATH,AKIF_WORKER_URL:base,AKIF_WORKER_TOKEN:'synthetic-worker',UDC_DOCUMENT_EXTRACTOR_URL:base,UDC_DOCUMENT_EXTRACTOR_TOKEN:'synthetic-extractor'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    const timeout=setTimeout(()=>child.kill('SIGKILL'),20_000);const code=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timeout);
    assert.equal(code,0);assert.deepEqual(seen,['/media/image/transcribe','/media/audio/transcribe','/extract']);
    const line=output.split('\n').find(line=>line.startsWith('UDC_ACCEPTANCE_RESULT '))!;
    const report=JSON.parse(line.slice('UDC_ACCEPTANCE_RESULT '.length));assert.equal(report.calls,3);assert.equal(report.budget,3);assert.ok(report.results.every((r:any)=>r.status==='passed'));
    assert.doesNotMatch(output,/synthetic-worker|synthetic-extractor|Copper cathode/);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
