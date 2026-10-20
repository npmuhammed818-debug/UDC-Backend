import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('acceptance supervisor claims each run once and isolates child credentials',async()=>{
  const records:any[]=[];const children:any[]=[];let locks=0;
  const child=new EventEmitter() as any;child.stdout=new EventEmitter();child.kill=()=>true;
  const tx={execute:async()=>{locks++},select:()=>({from:()=>({where:()=>({limit:async()=>records.filter(r=>r.action==='acceptance_probe_started')})})}),insert:()=>({values:async(v:any)=>records.push(v)})};
  const state:any={db:{...tx,transaction:async(f:any)=>f(tx)},spawn:(...args:any[])=>{children.push(args);return child},logger:{info:()=>{},warn:()=>{}}};
  (globalThis as any).__acceptanceSupervisor=state;
  const output=fileURLToPath(new URL(`./acceptance-supervisor-${randomUUID()}.mjs`,import.meta.url));
  const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/akif/acceptanceProbe.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-supervisor',setup(b){
    const fixtures:any={db:'export const db=globalThis.__acceptanceSupervisor.db;export const auditLogsTable={id:1,action:2,metadata:3};',orm:'export const and=()=>true;export const eq=()=>true;export const sql=()=>true;',child:'export const spawn=globalThis.__acceptanceSupervisor.spawn;',logger:'export const logger=globalThis.__acceptanceSupervisor.logger;'};
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/^node:child_process$/,'child'],[/\/lib\/logger$/,'logger']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundled.outputFiles[0].text);
  const previous={...process.env};
  try {
    const {startAcceptanceProbe}=await import(output);
    delete process.env.UDC_ACCEPTANCE_RUN_ID;
    delete process.env.UDC_ACCEPTANCE_MODE;
    await startAcceptanceProbe();assert.equal(locks,0);
    process.env.UDC_ACCEPTANCE_RUN_ID='synthetic_run_123';
    process.env.AKIF_WORKER_URL='https://worker.invalid';process.env.AKIF_WORKER_TOKEN='synthetic-worker';
    process.env.SUPABASE_DATABASE_URL='synthetic-database';process.env.WHATSAPP_ACCESS_TOKEN='synthetic-meta';process.env.OPENAI_API_KEY='synthetic-paid';
    await startAcceptanceProbe();await startAcceptanceProbe();
    assert.equal(children.length,1);assert.equal(locks,2);
    assert.equal(records.filter(r=>r.action==='acceptance_probe_started').length,1);
    assert.deepEqual(Object.keys(children[0][2].env).sort(),['AKIF_WORKER_TOKEN','AKIF_WORKER_URL','PATH']);
    assert.match(children[0][1][0],/acceptance\/live-intake\.mjs$/);
    child.stdout.emit('data','UDC_ACCEPTANCE_RESULT '+JSON.stringify({calls:1,results:[{name:'synthetic',status:'blocked'}]})+'\n');
    child.emit('close',1);
    await new Promise(resolve=>setImmediate(resolve));
    const completed=records.find(r=>r.action==='acceptance_probe_completed');assert.equal(completed.metadata.calls,1);assert.equal(completed.metadata.completed,true);
    assert.doesNotMatch(JSON.stringify(records),/synthetic-worker|synthetic-database|synthetic-meta|synthetic-paid/);
    records.length=0;
    process.env.UDC_ACCEPTANCE_MODE='media';process.env.UDC_ACCEPTANCE_RUN_ID='synthetic_media_123';
    process.env.UDC_DOCUMENT_EXTRACTOR_URL='https://extractor.invalid';process.env.UDC_DOCUMENT_EXTRACTOR_TOKEN='synthetic-extractor';
    await startAcceptanceProbe();assert.equal(children.length,2);
    assert.match(children[1][1][0],/acceptance\/live-media\.mjs$/);
    assert.deepEqual(Object.keys(children[1][2].env).sort(),['AKIF_WORKER_TOKEN','AKIF_WORKER_URL','PATH','UDC_DOCUMENT_EXTRACTOR_TOKEN','UDC_DOCUMENT_EXTRACTOR_URL']);
    assert.equal(records[0].metadata.budget,3);assert.equal(records[0].metadata.mode,'media');
    child.emit('close',1);await new Promise(resolve=>setImmediate(resolve));

  } finally {
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
    child.emit('close',1);await unlink(output);delete (globalThis as any).__acceptanceSupervisor;
  }
});
