// Synthetic model quality probe. No database, Meta, storage or paid fallback clients.
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL(`./probe-${randomUUID()}.mjs`, import.meta.url));
const results = [];
let calls = 0;
let diagnostic = {};
// Capture only the parser's fixed diagnostic codes; never its input/model text.
console.warn = (_message, detail) => {
  if (['invalid_json','invalid_schema','unsafe_reply','model_request_failed'].includes(detail?.reason))
    diagnostic = { ...diagnostic, reason: detail.reason, ...(detail.issues ? { issues: detail.issues } : {}) };
};
try {
  if (!process.env.AKIF_WORKER_URL || !process.env.AKIF_WORKER_TOKEN) throw new Error('worker_configuration_missing');
  const built = await build({ entryPoints: [fileURLToPath(new URL('../src/akif/intakeConversation.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, plugins: [{name:'worker-only', setup(b) {
    b.onResolve({filter:/\/intelligence\/hermesClient$/}, () => ({path:'bridge',namespace:'bridge'}));
    b.onLoad({filter:/.*/,namespace:'bridge'}, () => ({contents:`import {runAkifWorkerChat} from ${JSON.stringify(fileURLToPath(new URL('../src/akif/intelligence/workerClient.ts', import.meta.url)))};
      export async function runConversationChat(...args) {
        try {
          globalThis.__udcProbeModelCalls = (globalThis.__udcProbeModelCalls ?? 0) + 1;
          const result = await runAkifWorkerChat(...args);
          globalThis.__udcProbeResponseShape = { length: result.content.length, startsJson: result.content.trim().startsWith('{'), endsJson: result.content.trim().endsWith('}'), fenced: result.content.trim().startsWith('\x60\x60\x60') };
          return result;
        } catch(error) {
          const match = String(error?.message ?? '').match(/HTTP (\\d{3})/);
          globalThis.__udcProbeHttpStatus = match ? Number(match[1]) : null;
          throw error;
        }
      }`,resolveDir:fileURLToPath(new URL('../',import.meta.url))}));
    b.onResolve({filter:/\/decisionModels$/}, () => ({path:'hints',namespace:'hints'}));
    b.onLoad({filter:/.*/,namespace:'hints'}, () => ({contents:'export const intakeDecisionHint = async () => null;'}));
  }}]});
  await writeFile(output,built.outputFiles[0].text);
  const {interpretIntakeConversation} = await import(output);
  const cases = [
    {name:'complete_copper_port_and_incoterm', message:'I need 100 MT copper cathode, target USD 5,900 per MT, CIF Jebel Ali', role:'buyer',memory:null, expect:{product:/copper/i,quantity:100,targetPrice:5900,destination:/Jebel Ali/i,incoterm:'CIF'}, noQuestion:true},
    {name:'preserve_grade_and_delivery', message:'We need 200 MT sugar ICUMSA 45 at USD 500 per MT, CIF Mombasa, delivery within 30 days',role:'buyer',memory:null,expect:{quantity:200,targetPrice:500,destination:/Mombasa/i,specification:/45/,deliveryTime:/30/},noQuestion:true},
    {name:'partial_buyer_keeps_missing_fields',message:'I need 100 MT sugar',role:'buyer',memory:null,expect:{product:/sugar/i,quantity:100},absent:['targetPrice','destination']},
    {name:'buyer_followup_uses_memory',message:'USD 500 per MT, CIF Mombasa',role:'buyer',memory:{product:'Sugar',quantity:100,unit:'MT',conversation:[{message:'I need 100 MT sugar',reply:'What target price are you working with?'}]},expect:{targetPrice:500,destination:/Mombasa/i,incoterm:'CIF'},noQuestion:true},
    {name:'seller_terms',message:'We can supply 100 MT sugar ICUMSA 45 at USD 490 per MT, FOB Santos, available in 14 days, monthly capacity 1000 MT, MOQ 50 MT',role:'seller',memory:null,expect:{price:490,specification:/45/,availability:/14/,monthlyCapacity:1000,minimumOrderQuantity:50},noQuestion:true},
  ];
  for (const c of cases) {
    if (calls) await new Promise(resolve=>setTimeout(resolve,65_000));
    calls++;
    diagnostic = {};
    const decision = await interpretIntakeConversation({message:c.message,role:c.role,memory:c.memory});
    if (!decision) { results.push({name:c.name,status:'blocked',reason:diagnostic.reason ?? 'provider_or_response_validation_failed', ...(diagnostic.issues ? { issues: diagnostic.issues } : {}), httpStatus:globalThis.__udcProbeHttpStatus ?? null, shape:globalThis.__udcProbeResponseShape ?? null});break; }
    const failures=[];
    if(decision.role!==c.role) failures.push('role');
    for(const [key,value] of Object.entries(c.expect)) if(value instanceof RegExp ? !value.test(String(decision.fields[key]??'')) : decision.fields[key]!==value) failures.push(key);
    for(const key of c.absent??[]) if(decision.fields[key]!==undefined) failures.push(`invented_${key}`);
    if(c.noQuestion && /\?/.test(decision.reply)) failures.push('unnecessary_question');
    results.push({name:c.name,status:failures.length?'failed':'passed',failures});
  }
} catch { results.push({name:'probe_runtime',status:'blocked',reason:'configuration_or_runtime_failure'}); }
finally { await unlink(output).catch(()=>{}); }
console.log('UDC_ACCEPTANCE_RESULT '+JSON.stringify({mode:'synthetic_live_intake',calls,modelCalls:globalThis.__udcProbeModelCalls??0,budget:5,results}));
process.exitCode=results.some(r=>r.status!=='passed')?1:0;
