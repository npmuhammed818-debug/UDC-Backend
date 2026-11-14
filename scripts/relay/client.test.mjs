import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const id='00000000-0000-4000-8000-000000000001';
function run(client,args,reason,status=200){
 const setup=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {createHmac} from 'node:crypto';
const read=fs.readFileSync;fs.readFileSync=function(path,...args){if(String(path).includes('/.vault/'))return 'synthetic-offline-secret';return read.call(this,path,...args)};syncBuiltinESMExports();
globalThis.fetch=async(url,options)=>{const expected='sha256='+createHmac('sha256','synthetic-offline-secret').update(options.body).digest('hex');if(options.headers['x-udc-relay-signature']!==expected)throw Error('bad signature');console.log(JSON.stringify({captured:true,url,method:options.method,body:JSON.parse(options.body)}));return {status:${status},ok:${status<300},json:async()=>(${status===200?'{ok:true,dismissed:1}':'{ok:false,error:"claim_lost"}'})}};`;
 return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(setup),new URL(client,import.meta.url).pathname,...args],{input:reason,encoding:'utf8',timeout:5000});
}
for(const client of ['worker.mjs','relay.mjs']){
 test(client+' dismiss signs item-specific completion without reply',()=>{
  const r=run(client,['dismiss','synthetic-worker','15550000000',id],'Covered by earlier delivered reply.\n');assert.equal(r.status,0,r.stderr);
  const request=JSON.parse(r.stdout.split('\n')[0]);assert.equal(request.url,'https://udc-staging-api.onrender.com/api/akif-relay/dismiss');assert.equal(request.method,'POST');assert.deepEqual(request.body,{phone:'15550000000',itemId:id,workerId:'synthetic-worker',reason:'Covered by earlier delivered reply.'});
 });
 for(const [name,args,reason] of [['missing item',['dismiss','synthetic-worker','15550000000'],'covered'],['invalid item',['dismiss','synthetic-worker','15550000000','not-uuid'],'covered'],['empty reason',['dismiss','synthetic-worker','15550000000',id],''],['long reason',['dismiss','synthetic-worker','15550000000',id],'x'.repeat(201)]]){
  test(client+' rejects '+name+' without network',()=>{const r=run(client,args,reason);assert.equal(r.status,1);assert.equal(r.stdout,'');});
 }
 test(client+' stale claim is a failure, no fallback',()=>{const r=run(client,['dismiss','synthetic-worker','15550000000',id],'covered',409);assert.equal(r.status,1);assert.match(r.stdout,/claim_lost/);assert.equal(r.stdout.split('\n').filter(l=>l.includes('captured')).length,1);});
 test(client+' skip remains release only',()=>{const r=run(client,['skip','15550000000'],'');assert.equal(r.status,0,r.stderr);const request=JSON.parse(r.stdout.split('\n')[0]);assert.ok(request.url.endsWith('/skip'));assert.deepEqual(request.body,{phone:'15550000000'});});
}
