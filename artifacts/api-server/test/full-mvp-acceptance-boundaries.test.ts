import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('../../../',import.meta.url);
const driver=readFileSync(new URL('scripts/acceptance/full-mvp.mjs',root),'utf8');
test('full synthetic acceptance pins current legal source and reports no launch approval',()=>{
 const baseline=/const legalSourceBaseline = '([a-f0-9]{40})';/.exec(driver)?.[1];
 assert.equal(baseline,'6ad693fa4e4e93a2631ee68c6378efb8071a2248');
 assert.match(driver,/run\('legal-text-preserved', 'git', \['diff', '--exit-code', legalSourceBaseline, '--'/);
 assert.match(driver,/const report = \{ legalSourceBaseline, legalLaunchApproved: false/);
 assert.match(driver,/fullMvpAccepted: false, stagingActivationApproved: false/);
 const result=spawnSync('git',['diff','--exit-code',baseline!,'--','artifacts/api-server/src/privacy/policies.ts','artifacts/api-server/src/privacy/consentNotice.ts'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
test('full acceptance keeps all native suite inventory and exact source-integrity gates',()=>{
 assert.match(driver,/assert\.deepEqual\(pg\.map\(p => p\.id \+ '-postgres\.mjs'\)\.sort\(\), programs\.sort\(\)/);
 assert.match(driver,/if \(sourceDigest\(\) !== digest\)/);
 assert.match(driver,/explicit_disposable_container_required/);
 assert.match(driver,/every\(s => s\.status === 'PASS'\) && pg\.length > 0 && pg\.every/);
});
