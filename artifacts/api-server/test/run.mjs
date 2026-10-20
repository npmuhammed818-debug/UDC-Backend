import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = (await readdir(new URL('./', import.meta.url))).filter(name => name.endsWith('.test.ts')).sort();
// Build hosts also contain runtime credentials and probe flags. Tests supply
// their own isolated fixtures and must never inherit production configuration.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SYSTEMROOT'].includes(key)));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files.map(name => `test/${name}`)], { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error('Isolated test process could not start.');
process.exitCode = result.status ?? 1;
