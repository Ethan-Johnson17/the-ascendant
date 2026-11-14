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

  it('prefers the publishable key and falls back to the legacy anon key', () => {
    const both = parseEnv({
      VITE_SUPABASE_URL: valid.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrst',
      VITE_SUPABASE_ANON_KEY: valid.VITE_SUPABASE_ANON_KEY,
    });
    assert.ok(both.ok && both.config.supabaseKey.startsWith('sb_publishable_'));
    const legacy = parseEnv(valid);
    assert.ok(legacy.ok && legacy.config.supabaseKey === valid.VITE_SUPABASE_ANON_KEY);
  });

  it('refuses a secret key', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: valid.VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.issues.join(' '), /SECRET/);
  });
});
