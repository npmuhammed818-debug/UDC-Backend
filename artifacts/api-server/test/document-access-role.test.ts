import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The database CHECK on document_access.access_role is the source of truth (migration 0003, same constraint live on UDC-Staging).
// Unit tests that fake the database cannot see it, so this test reads the real constraint and checks every role literal the code writes.
const migrations = join(import.meta.dirname, '../../../lib/db/migrations');
const allowed = (() => {
  for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
    const m = /document_access_role_check\s+CHECK \(access_role IN \(([^)]*)\)\)/s.exec(readFileSync(join(migrations, file), 'utf8'));
    if (m) return m[1]!.split(',').map(x => x.trim().replace(/'/g, ''));
  }
  throw new Error('document_access_role_check not found');
})();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
}

test('every accessRole literal written to document_access is allowed by the real database constraint', () => {
  assert.deepEqual(allowed.sort(), ['editor', 'reviewer', 'viewer']);
  const used = new Set<string>();
  for (const file of sourceFiles(join(import.meta.dirname, '../src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/accessRole:\s*["']([a-z_]+)["']/g)) used.add(m[1]!);
  }
  assert.ok(used.size > 0);
  for (const role of used) assert.ok(allowed.includes(role), `accessRole "${role}" would violate document_access_role_check`);
});

test('WhatsApp draft preparation answers with a safe retry message instead of throwing', () => {
  const source = readFileSync(join(import.meta.dirname, '../src/routes/whatsappWebhook.ts'), 'utf8');
  const start = source.indexOf('const draft = await generateWhatsAppDraftPdf(');
  const end = source.indexOf('Prepared the ${draftRequest.type} draft for your review.');
  assert.ok(start > 0 && end > start);
  const before = source.slice(Math.max(0, start - 40), start);
  assert.match(before, /try \{\s*$/);
  assert.match(source.slice(end, end + 1200), /catch \(error\)[\s\S]*I could not prepare that draft right now[\s\S]*Nothing was saved/);
});
