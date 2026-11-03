// Compatibility entry point for the existing CI command. Run the canonical TS
// test with the same stripped-types Node mode used by test/run.mjs.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
  ['PATH','HOME','TMPDIR','TEMP','SYSTEMROOT'].includes(key)));
const result=spawnSync(process.execPath,['--experimental-strip-types','--test',
  fileURLToPath(new URL('./whatsapp-shipment-outbox.test.ts',import.meta.url))],{env,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)throw new Error(`Canonical outbox regression failed (${result.status??result.signal})`);
