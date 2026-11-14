import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from './env.ts';

const valid = {
  VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
};

describe('parseEnv', () => {
  it('accepts a complete configuration and defaults AI mode to fixtures', () => {
    const result = parseEnv(valid);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.config.aiMode, 'fixtures');
  });

  it('treats an unedited .env.example (empty strings) as missing values', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_AI_MODE: 'fixtures' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.includes('VITE_SUPABASE_URL')));
      assert.ok(result.issues.some((i) => i.includes('VITE_SUPABASE_ANON_KEY')));
    }
  });

  it('rejects a malformed URL and an unknown AI mode', () => {
    const result = parseEnv({ ...valid, VITE_SUPABASE_URL: 'not a url', VITE_AI_MODE: 'magic' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues.length, 2);
  });
});
