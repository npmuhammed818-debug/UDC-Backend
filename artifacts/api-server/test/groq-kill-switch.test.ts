import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGroqConfigured } from '../src/akif/intelligence/groqClient.ts';

// Owner direction 10 Nov: Groq is off everywhere until he says otherwise.
// A set GROQ_API_KEY alone must not enable any Groq traffic; AKIF_GROQ=on
// re-enables it.

test('Groq is off by default even when GROQ_API_KEY is set', () => {
  const saved = { key: process.env.GROQ_API_KEY, sw: process.env.AKIF_GROQ };
  try {
    process.env.GROQ_API_KEY = 'synthetic-groq-key';
    delete process.env.AKIF_GROQ;
    assert.equal(isGroqConfigured(), false);

    process.env.AKIF_GROQ = 'on';
    assert.equal(isGroqConfigured(), true);

    process.env.AKIF_GROQ = 'off';
    assert.equal(isGroqConfigured(), false);
  } finally {
    if (saved.key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = saved.key;
    if (saved.sw === undefined) delete process.env.AKIF_GROQ; else process.env.AKIF_GROQ = saved.sw;
  }
});
