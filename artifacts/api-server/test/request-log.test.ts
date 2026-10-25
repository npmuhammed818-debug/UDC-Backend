import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRequestLogPath } from '../src/lib/requestLog.ts';

test('vault bearer credentials and query secrets never enter request-log paths', () => {
  for (const suffix of ['', '/', '?code=private', '#private']) {
    assert.equal(safeRequestLogPath('/api/vault/upload/private-bearer' + suffix), '/api/vault/upload/[redacted]');
  }
  assert.equal(safeRequestLogPath('/api/healthz?secret=private'), '/api/healthz');
  assert.equal(safeRequestLogPath('/api/vault/upload-links'), '/api/vault/upload-links');
  assert.equal(safeRequestLogPath('/api/vault/upload/private-bearer/invalid'), '/api/vault/upload/[redacted]');
  assert.equal(safeRequestLogPath('/API/VAULT/UPLOAD/private-bearer'), '/API/VAULT/UPLOAD/[redacted]');
  assert.equal(safeRequestLogPath(undefined), undefined);
});
