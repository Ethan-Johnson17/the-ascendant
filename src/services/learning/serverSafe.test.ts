import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The `learning` and `ai` Edge Functions (Deno) import this code directly. Every file it reaches must use
 * only relative `.ts` imports or the packages mapped in supabase/functions/learning/deno.json, and
 * no browser- or Node-only globals.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const allowedPackages = new Set(['zod', '@supabase/supabase-js']);
const forbidden = /\b(window|document|localStorage|sessionStorage)\.|\bprocess\.env\b|\brequire\(/;

function walk(file: string, seen: Set<string>) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!forbidden.test(code), `${file} uses a browser/Node-only global`);
  for (const m of code.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1]!;
    if (spec.startsWith('.')) {
      assert.ok(spec.endsWith('.ts'), `${file}: import "${spec}" needs an explicit .ts extension for Deno`);
      walk(resolve(dirname(file), spec), seen);
    } else {
      assert.ok(allowedPackages.has(spec), `${file}: package "${spec}" is not mapped for the Edge Function`);
    }
  }
}

describe('Edge Function code is Deno-safe', () => {
  for (const fn of ['learning', 'ai']) {
    it(`${fn}: reaches only pure modules and mapped packages`, () => {
      const seen = new Set<string>();
      walk(resolve(root, `supabase/functions/${fn}/index.ts`), seen);
      assert.ok(seen.size > 4, 'walked the shared code');
      const map = JSON.parse(readFileSync(resolve(root, `supabase/functions/${fn}/deno.json`), 'utf8')) as { imports: Record<string, string> };
      assert.deepEqual(Object.keys(map.imports).sort(), [...allowedPackages].sort());
    });
  }
});
