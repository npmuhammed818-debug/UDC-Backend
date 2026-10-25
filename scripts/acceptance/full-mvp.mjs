// Local/synthetic acceptance only. Does not accept hosted database URLs or
// activate production flags. Each run has a fresh directory and source digest.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  ['PATH', 'HOME', 'TMPDIR', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
    'DOCKER_HOST', 'DOCKER_CONFIG'].includes(k)));
const container = process.env.UDC_QA_POSTGRES_CONTAINER_ID ?? '';
const python = process.env.UDC_QA_PYTHON ?? 'python';
function sourceDigest() {
  const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '--', 'artifacts', 'lib', 'services', 'scripts', '.github',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'], { cwd: root, encoding: 'utf8' });
  assert.equal(listed.status, 0);
  const digest = createHash('sha256');
  for (const name of [...new Set(listed.stdout.trim().split('\n'))].sort()) {
    if (!name) continue;
    digest.update(name + '\0'); digest.update(readFileSync(path.join(root, name)));
  }
  return digest.digest('hex');
}
const directory = path.join(root, '.acceptance-results', 'full-mvp-' + randomBytes(8).toString('hex'));
mkdirSync(directory, { recursive: true });
const digest = sourceDigest();
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const stages = [];
function run(id, command, args, extra = {}, testOutput = false) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, env: { ...env, ...extra }, encoding: 'utf8', timeout: 900_000, maxBuffer: 32 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`;
  const log = id + '.log'; writeFileSync(path.join(directory, log), output);
  const status = result.status === 0 && (!testOutput || /(?:[ℹ#] tests [1-9]\d*|\b[1-9]\d* passed\b|PASSED:)/.test(output)) ? 'PASS' : 'FAIL';
  stages.push({ id, status, exitCode: result.status, durationMs: Date.now() - started, log });
  console.log(`${status}: ${id}`);
  return status === 'PASS';
}
const docker = (...args) => {
  const r = spawnSync('docker', ['exec', container, ...args], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw Error('isolated_container_operation_failed');
  return r.stdout.trim();
};

run('codegen', 'pnpm', ['--filter', '@workspace/api-spec', 'run', 'codegen']);
run('legal-text-preserved', 'git', ['diff', '--exit-code', '2ad7aa7a359adfd4b64d3a3527e673eda15f3170', '--', 'artifacts/api-server/src/privacy/policies.ts', 'artifacts/api-server/src/privacy/consentNotice.ts']);
run('generated-contracts', 'git', ['diff', '--exit-code', '--', 'lib/api-zod/src/generated', 'lib/api-client-react/src/generated']);
run('release', 'pnpm', ['run', 'release:verify'], {}, true);
run('feature-groups', 'pnpm', ['run', 'acceptance'], {}, true);
const javascript = readdirSync(path.join(root, 'artifacts/api-server/test')).filter(f => f.endsWith('.test.mjs'));
assert.ok(javascript.length);
run('javascript', process.execPath, ['--test', ...javascript.map(f => 'artifacts/api-server/test/' + f)], {}, true);
run('python', python, ['-m', 'pytest', 'services/akif-worker/tests', 'services/document_extractor/tests', '-q', '--junitxml=' + path.join(directory, 'python.xml')],
  { PYTHONPATH: 'services/akif-worker:.' }, true);
run('python-compile', python, ['-m', 'compileall', '-q', 'services/akif-worker/app', 'services/akif-worker/tests']);
run('hermes-config', 'docker', ['compose', '-f', 'docker-compose.hermes.yml', 'config', '--quiet'], { HERMES_AKIF_API_KEY: 'synthetic-test-only' });
run('dependency-audit', 'pnpm', ['audit', '--json']);

let pg = [];
if (/^[a-f0-9]{64}$/.test(container)) {
  const pgDirectory = path.join(directory, 'postgres');
  run('postgres', process.execPath, ['scripts/qa/run-postgres-integration.mjs', '--output-dir=' + pgDirectory], { UDC_QA_POSTGRES_CONTAINER_ID: container });
  try {
    pg = JSON.parse(readFileSync(path.join(pgDirectory, 'postgres-results.json'), 'utf8')).results;
    const programs = readdirSync(path.join(root, 'artifacts/api-server/test/integration')).filter(f => f.endsWith('-postgres.mjs'));
    assert.deepEqual(pg.map(p => p.id + '-postgres.mjs').sort(), programs.sort(), 'every PostgreSQL suite must execute');
  } catch {
    stages.push({ id: 'postgres-inventory', status: 'FAIL', reason: 'missing_or_incomplete_current_run_results' });
  }
  const control = 'udc_qa_migration_acceptance_' + randomBytes(6).toString('hex');
  let createdRole = false, createdDB = false;
  try {
    if (!docker('psql', '-U', 'udc_dev', '-d', 'postgres', '-Atc', "SELECT 1 FROM pg_roles WHERE rolname='udc_migration_test'")) {
      docker('psql', '-U', 'udc_dev', '-d', 'postgres', '-c', 'CREATE ROLE udc_migration_test LOGIN SUPERUSER'); createdRole = true;
    }
    docker('createdb', '-U', 'udc_dev', '-O', 'udc_migration_test', control); createdDB = true;
    const extra = { UDC_MIGRATION_QA_DATABASE_URL: `postgresql://udc_migration_test@127.0.0.1:5432/${control}?sslmode=disable`, UDC_QA_POSTGRES_CONTAINER_ID: container };
    for (const [id, file] of [['email-migrations', 'email-migration-review'], ['shipment-migrations', 'shipment-migration-review'], ['restore', 'mvp-backup-restore-rehearsal']])
      run(id, process.execPath, ['artifacts/api-server/test/integration/' + file + '.mjs'], extra, true);
  } catch { stages.push({ id: 'migration-prerequisites', status: 'FAIL', reason: 'isolated_container_operation_failed' }); }
  finally {
    try {
      if (createdDB) docker('dropdb', '-U', 'udc_dev', control);
      if (createdRole) docker('psql', '-U', 'udc_dev', '-d', 'postgres', '-c', 'DROP ROLE udc_migration_test');
    } catch { stages.push({ id: 'migration-cleanup', status: 'FAIL' }); }
  }
} else stages.push({ id: 'postgres', status: 'FAIL', reason: 'explicit_disposable_container_required' });

if (sourceDigest() !== digest) stages.push({ id: 'source-integrity', status: 'FAIL', reason: 'source_changed_during_run_rerun_required' });
const proof = new Map([...stages, ...pg.map(p => ({ ...p, id: 'pg:' + p.id }))].map(s => [s.id, s.status]));
const requirements = [
  ['Buyer/seller/agent signed WhatsApp consent, registration, retries and multiple offers', ['pg:whatsapp-buyer', 'pg:whatsapp-onboarding-ux'], 'Signed webhook, real SQL, simulated Meta/AI/email'],
  ['Continuous registered cohort: OTP → private company evidence → matching → documents → DLC/SGS → completion', ['pg:full-mvp-lifecycle'], 'Real web/API routes and SQL; mail/storage/model boundaries simulated; not one continuous live WhatsApp conversation'],
  ['Email ownership, expiry, resends, guessing limits and one-time proof', ['pg:email-auth'], 'Real routes, hashing and SQL; simulated mail'],
  ['Password recovery and old-session revocation', ['pg:email-auth'], 'Real SQL/concurrent login/reset; no real inbox'],
  ['Same-email WhatsApp number continuity without duplicate identity/takeover', ['pg:email-auth'], 'Real phone-recovery transactions, competing codes and identity checks'],
  ['Failed company verification and matching gates', ['pg:company-verification', 'pg:full-mvp-lifecycle'], 'Actual approved/rejected company proof and human verification routes'],
  ['Seller multiple independent offers', ['pg:whatsapp-buyer', 'pg:full-mvp-lifecycle'], 'Separate persisted units/currencies/prices'],
  ['Buyer/seller matching, negotiation and private room permissions', ['pg:full-mvp-lifecycle', 'release'], 'Actual matching and stage routes plus isolated conversational regressions'],
  ['LOI/ICPO/FCO/SPA/NCNDA drafting and approval boundaries', ['pg:full-mvp-lifecycle'], 'Real routes, draft status, recorded terms and role checks; not executed legal documents'],
  ['DLC coordination, SGS evidence, completion and commission payout records', ['pg:full-mvp-lifecycle'], 'Real human-controlled record transitions; no bank instrument or payment executed'],
  ['Agent referral code/invitation and referred users', ['pg:full-mvp-lifecycle', 'release'], 'Actual signed invite registration and referral association'],
  ['Agent assigned deals/progress without confidential prices', ['pg:p0-gates', 'pg:full-mvp-lifecycle'], 'Real SQL/API privacy checks'],
  ['Commission permissions, currency precision and agreed calculations', ['pg:commission-routes', 'pg:commission-migration', 'pg:full-mvp-lifecycle'], 'Real SQL; optional three-decimal rollout remains separate'],
  ['Role-change request/review without privilege escalation', ['pg:full-mvp-lifecycle'], 'Real SQL regression; reviewed does not activate a new role'],
  ['Cancellation, interrupted registration, cancel/edit/restart', ['pg:full-mvp-lifecycle', 'pg:whatsapp-onboarding-ux'], 'Separate admin cancellation boundary and signed interrupted conversations'],
  ['Vault access, token expiry/single-use and deletion requests', ['pg:vault', 'pg:full-mvp-lifecycle'], 'Real SQL/API, expiry/reuse/outsider denials, malformed upload-origin denial; storage operations simulated'],
  ['Marketplace verification and tenant/agent isolation', ['pg:p0-gates', 'pg:full-mvp-lifecycle'], 'Unverified/outsider/agent negative controls'],
  ['Webhook HMAC, durable replay/crash/concurrency protection', ['pg:whatsapp-webhook-retry', 'pg:shipment-delivery', 'release'], 'Signed synthetic HTTP and exact SQL migration'],
  ['Shipment milestones, cargo ETA, notifications, templates and receipts', ['pg:shipment-delivery', 'javascript'], 'Actual admin→outbox→simulated Meta→signed callback; malformed 2xx quarantined without resend/false confirmation; concurrent legacy replays gated; flags enabled only in fixture'],
  ['Buyer pools: acceptance/decline, capacity and expiry', ['pg:buyer-pools'], 'Real SQL and routes; financial instruments unchanged'],
  ['AKIF authorized SQL context, private history and action boundaries', ['pg:full-mvp-lifecycle', 'release'], 'Captured simulated model request; vault URLs/private counterparty history absent; no approvals executed'],
  ['AKIF worker, model outages, media/voice and guidance safety', ['python', 'release', 'pg:whatsapp-onboarding-ux'], 'Isolated model/media fixtures and deterministic outage fallback; not natural-language quality proof'],
  ['Logging, privacy consent, grievance/incident and admin regressions', ['release', 'feature-groups', 'legal-text-preserved'], 'Safety/authorization and canonical website/support regressions; approved legal source files unchanged; not legal certification'],
  ['Generated API contracts, builds and dependency advisories', ['codegen', 'generated-contracts', 'release', 'dependency-audit'], 'Audit and current code checks; no guarantee against unknown vulnerabilities'],
  ['Exact migration compatibility, restricted grants/RLS and lock rollback', ['email-migrations', 'shipment-migrations', 'pg:whatsapp-webhook-retry'], 'Disposable PostgreSQL roles only; not hosted project permissions'],
  ['Selected new-table database backup/restore including vault and dedup', ['restore'], 'Real pinned pg_dump/pg_restore for 14 selected tables; excludes hosted Storage and full Supabase project restore'],
  ['Actual canonical role activation / multi-role transition', [], 'Not implemented by the reviewed request-only design; requires owner-approved access/identity transition policy'],
  ['Live WhatsApp onboarding, natural multilingual guidance and complete human UAT', [], 'Requires approved staging number, real provider and authorized participants'],
  ['Real OTP inbox delivery, domain/provider readiness', [], 'Requires verified sender/domain and separately approved test mail'],
  ['Hosted private Storage signed access, expiry and physical deletion', [], 'Requires approved test project/credentials; local fake storage is insufficient'],
  ['Actual Supabase TLS, effective role grants/RLS and full project restore', [], 'Requires approved isolated hosted target, CA and complete database/object backup'],
  ['Live Meta templates, service windows, delivery/read/failure and billing acceptance', [], 'Requires approved template/number/recipients and explicit sending approval'],
  ['Real carrier data, SGS/banking evidence, transfers and signed legal documents', [], 'External/human authority; simulations do not execute or certify these'],
  ['Legal notice, support mailbox and privacy/provider processing approval', [], 'Source wording integrated from draft PRs; legal/domain review remains a human gate'],
];
const capabilities = requirements.map(([capability, needed, scope]) => ({ capability, automated: !needed.length ? 'NOT YET VERIFIED' : needed.every(id => proof.get(id) === 'PASS') ? 'PASS' : 'FAIL',
  realProvider: 'NOT YET VERIFIED', evidence: needed, scope }));
const passed = stages.every(s => s.status === 'PASS') && pg.length > 0 && pg.every(s => s.status === 'PASS');
const report = { generatedAt: new Date().toISOString(), revision, sourceDigest: digest,
  localChecksPassed: passed, fullMvpAccepted: false, stagingActivationApproved: false,
  parallelSources: { acceptanceBase: '2ad7aa7a359adfd4b64d3a3527e673eda15f3170', base: '83fddc6cd8fba5f7fa6f2edc36a27aba9cdd2bb2', pr181: 'd71c1573bd0f96e19ba6bcbdbb914ec08283f5ca', pr182: '767f0fad88ba0fec3204d79f1a88f5fb4b406481', onboarding: '1578783b60c38c5e4b107f923e686e1dd8107606' },
  stages, postgres: pg, capabilities };
writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(directory, 'report.md'), '# Full MVP acceptance evidence\n\nLocal checks: **' + (passed ? 'PASS' : 'FAIL') + '**. Full MVP acceptance and staging activation: **not approved**.\n\n' +
  `Commit at run: \`${revision}\`; source digest: \`${digest}\`. Fresh artifacts are in this report directory.\n\n` +
  '| Capability | Automated result | Real provider/human acceptance | Required evidence stages | Scope / limits |\n| --- | --- | --- | --- | --- |\n' + capabilities.map(c => `| ${c.capability} | ${c.automated} | ${c.realProvider} | ${c.evidence.join(', ') || 'External/human gate'} | ${c.scope} |`).join('\n') + '\n');
console.log('Report: ' + path.relative(root, path.join(directory, 'report.md')));
if (!passed) process.exitCode = 1;
