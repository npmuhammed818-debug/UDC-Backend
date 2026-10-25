// Explicit disposable Docker service only. Never accepts a hosted database URL.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const container = process.env.UDC_QA_POSTGRES_CONTAINER_ID ?? '';
assert.match(container, /^[a-f0-9]{64}$/, 'identify the isolated PostgreSQL service container');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONFIG'].includes(k)));
const cases = [
  ['delivery', 'UDC_DELIVERY_QA_DATABASE_URL', 'shipment-delivery'],
  ['registration', 'UDC_QA_DATABASE_URL', 'whatsapp-buyer'],
  ['retry', 'UDC_QA_DATABASE_URL', 'whatsapp-webhook-retry'],
  ['email_auth', 'UDC_EMAIL_QA_DATABASE_URL', 'email-auth'],
  ['verification', 'UDC_VERIFICATION_QA_DATABASE_URL', 'company-verification'],
  ['p0gates', 'UDC_P0_QA_DATABASE_URL', 'p0-gates'],
  ['vault', 'UDC_VAULT_QA_DATABASE_URL', 'vault'],
  ['pools', 'UDC_POOLS_QA_DATABASE_URL', 'buyer-pools'],
  ['journey', 'UDC_JOURNEY_QA_DATABASE_URL', 'trade-journey'],
  ['commroutes', 'UDC_COMMROUTES_QA_DATABASE_URL', 'commission-routes'],
  ['commission', 'UDC_COMMISSION_QA_DATABASE_URL', 'commission-migration'],
];
mkdirSync(root + '.acceptance-results', { recursive: true });
function command(cmd, args, extra = {}) {
  const result = spawnSync(cmd, args, { cwd: root, env: { ...env, ...extra },
    encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0)
    throw new Error(`${cmd} failed (${result.status}): ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}
let failed = false;
// Supabase client-role names used by privilege assertions. Create them only in
// this explicitly selected disposable service, preserving any existing roles.
const addedRoles = [];
for (const role of ['anon', 'authenticated', 'service_role']) {
  const exists = command('docker', ['exec', container, 'psql', '-U', 'udc_dev', '-d', 'postgres', '-Atc',
    `SELECT 1 FROM pg_roles WHERE rolname='${role}'`]).trim();
  if (!exists) {
    command('docker', ['exec', container, 'psql', '-U', 'udc_dev', '-d', 'postgres', '-c', `CREATE ROLE ${role} NOLOGIN`]);
    addedRoles.push(role);
  }
}
for (const [prefix, variable, file] of cases) {
  const selected = process.argv.find(a => a.startsWith('--case='))?.slice(7);
  if (selected && selected !== file) continue;
  if (process.argv.includes('--extended') && ['registration', 'email_auth'].includes(prefix)) continue;
  const name = `udc_qa_${prefix}_${randomBytes(6).toString('hex')}`;
  const url = `postgresql://udc_dev@127.0.0.1:5432/${name}?sslmode=disable`;
  let created = false;
  try {
    command('docker', ['exec', container, 'createdb', '-U', 'udc_dev', name]);
    created = true;
    // Schema push is only fixture bootstrap in this empty disposable database.
    // Exact migration semantics are exercised by the migration/restore suites.
    if (prefix !== 'commission') command('pnpm', ['--filter', '@workspace/db', 'run', 'push'], {
      SUPABASE_DATABASE_URL: url, SUPABASE_DIRECT_URL: url,
    });
    const output = command(process.execPath, [`artifacts/api-server/test/integration/${file}-postgres.mjs`], { [variable]: url });
    writeFileSync(root + `.acceptance-results/${file}-postgres.log`, output);
    console.log(`PASSED: ${file}`);
  } catch (error) {
    failed = true;
    writeFileSync(root + `.acceptance-results/${file}-postgres.log`, String(error));
    console.error(`FAILED: ${file}; see .acceptance-results/${file}-postgres.log`);
  } finally {
    if (created) command('docker', ['exec', container, 'dropdb', '-U', 'udc_dev', name]);
  }
}
for (const role of addedRoles) command('docker', ['exec', container, 'psql', '-U', 'udc_dev', '-d', 'postgres', '-c', `DROP ROLE ${role}`]);
if (failed) process.exitCode = 1;
