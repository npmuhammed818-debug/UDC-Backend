import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const api = path.join(root, 'artifacts/api-server');
const groups = [
  ['Registration and verification', ['whatsapp-chat-ui', 'whatsapp-onboarding-identity', 'whatsapp-flows', 'whatsapp-signin', 'whatsapp-phone-recovery', 'auth-registration', 'email-auth', 'resend-otp', 'privacy-consent', 'whatsapp-webhook-routes', 'whatsapp-customer-window'], 'Human approval/rejection and all three registration roles need live acceptance.'],
  ['Inquiry, offers and matching', ['automatic-matching', 'admin-meetings', 'acceptance-supervisor', 'acceptance-probe', 'trade-intake-triage', 'explicit-intake-followup', 'intake-model-response', 'whatsapp-intake-conversation', 'akif-conversation-corpus', 'match-scoring', 'buyer-pool-concurrency', 'intake-persistence'], 'Live model quality and approved buyer/seller matching need acceptance.'],
  ['Private deal room', ['deal-conversation-privacy', 'private-deal-routes', 'document-signing-boundary', 'deal-document-routing', 'deal-conversation-memory', 'deal-decision-safety', 'deal-fact-reply', 'whatsapp-client'], 'Two-party text, image, PDF, voice and multilingual delivery need live acceptance.'],
  ['AI and document assistance', ['whatsapp-guidance', 'company-screening', 'media-acceptance', 'loi-draft', 'icpo-draft', 'fco-draft', 'spa-draft', 'ncnda-draft', 'whatsapp-draft', 'image-extractor-routing', 'worker-conversation', 'worker-timeouts', 'akif-brain-provider', 'decision-models', 'free-data-sources', 'official-trade-sources', 'impexq-client', 'impexq-admin-button'], 'Real document extraction, translation and contract summaries need acceptance.'],
  ['Referrals and commissions', ['agent-referral-chain', 'referral-invitation', 'auth-registration', 'commission-amount', 'admin-meetings'], 'Referral attribution, commission calculation and payout recording need end-to-end acceptance.'],
  ['Meetings', ['admin-meetings'], 'Real participant meeting requests, video delivery and in-person coordination need live acceptance.'],
  ['Post-deal operations', ['payment-policy', 'payment-milestone', 'admin-meetings'], 'Shipment evidence, customs, delivery, feedback and commission distribution need workflow acceptance.'],
  ['Admin control and analytics', ['admin-meetings', 'whatsapp-template-readiness', 'database-tls'], 'All admin route access controls are covered; reports, announcements and analytics still need workflow acceptance.'],
];
const available = new Set((await readdir(path.join(api, 'test'))).filter(n => n.endsWith('.test.ts')));
const assigned = new Set(groups.flatMap(([, names]) => names.map(n => `${n}.test.ts`)));
const unassigned = [...available].filter(n => !assigned.has(n));
if (unassigned.length) throw new Error(`Assign new suites to a SoW feature: ${unassigned.join(', ')}`);
const results = [];
for (const [feature, names, remaining] of groups) {
  const files = names.map(n => `test/${n}.test.ts`).filter(n => available.has(path.basename(n)));
  const started = Date.now();
  const run = files.length ? spawnSync(process.execPath, ['--experimental-strip-types', '--test', '--test-reporter=tap', ...files], {
    cwd: api, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    // Existing suites replace external boundaries. Never supply production secrets to tests.
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SYSTEMROOT'].includes(k))),
  }) : null;
  const output = `${run?.stdout ?? ''}\n${run?.stderr ?? ''}`;
  const count = key => Number(output.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0);
  const status = !run ? 'uncovered' : run.status === 0 ? 'passed' : 'failed';
  results.push({ feature, status, suites: files.length, passed: count('pass'), failed: count('fail'), skipped: count('skipped'), durationMs: Date.now() - started, remaining });
  console.log(`${status.toUpperCase()}: ${feature} (${count('pass')} checks)`);
  if (status === 'failed') process.stderr.write(output);
}
const report = { generatedAt: new Date().toISOString(), mode: 'isolated regression tests; no live AI or WhatsApp delivery', productionReady: false, results };
const directory = path.resolve(root, process.argv[2] ?? '.acceptance-results');
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(directory, 'report.md'), '# SoW regression coverage\n\nThese are isolated code checks, not proof of completed production workflows. Some suites cover multiple sections; do not add section counts together.\n\n| Feature | Regression result | Passed checks | Remaining acceptance |\n| --- | --- | ---: | --- |\n' + results.map(r => `| ${r.feature} | ${r.status} | ${r.passed} | ${r.remaining} |`).join('\n') + '\n');
if (results.some(r => r.status === 'failed')) process.exitCode = 1;
