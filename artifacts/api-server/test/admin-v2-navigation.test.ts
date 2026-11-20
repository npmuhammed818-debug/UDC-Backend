import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const page = (name: string) => readFile(new URL(`../../udc-app/src/pages/${name}`, import.meta.url), 'utf8');
test('overview activity opens Reports, never the classic desk', async () => {
  const overview = await page('admin-v2.tsx');
  assert.ok(overview.includes('href="/admin/v2/reports"'));
  assert.ok(!overview.includes('/admin/classic'));
});
test('Reports contains paginated activity using the protected audit endpoint', async () => {
  const reports = await page('admin-v2-more.tsx');
  assert.ok(reports.includes('id="activity"'));
  assert.ok(reports.includes('<ActivityLog />'));
  assert.ok(reports.includes('/api/admin/audit-log?limit=50&offset=${offset}'));
  assert.ok(reports.includes('activity.isError'));
  assert.ok(reports.includes('activity.data?.hasMore'));
});
test('existing new review pages are the destinations for person, company and document cards', async () => {
  const data = await page('admin-v2-data.ts');
  for (const path of ['/admin/v2/people#user-', '/admin/v2/companies#company-', '/admin/v2/documents#cdoc-', '/admin/v2/documents#ddoc-']) assert.ok(data.includes(path));
  for (const anchor of ['participant-review', 'company-review', 'company-evidence', 'deal-documents']) assert.ok(!data.includes(`/admin/classic#${anchor}`));
  const shell = await page('admin-v2-shell.tsx');
  assert.ok(shell.includes('href={item.detailsHref}'));
  assert.ok(shell.includes('id={item.key}'));
});

test('new desk never links users to classic for missing controls', async () => {
  for (const name of ['admin-v2.tsx','admin-v2-shell.tsx','admin-v2-data.ts','admin-v2-more.tsx']) assert.ok(!(await page(name)).includes('/admin/classic'), name);
});
