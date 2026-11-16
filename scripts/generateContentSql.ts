/**
 * Writes the authored curricula into a migration file.
 *
 *   npm run content:sql
 *
 * Validates each curriculum first (and against its campaign template's competencies); refuses to
 * write anything if a curriculum is invalid. supabase/tests/content-sync.test.ts fails if the
 * migration and the TypeScript content ever drift apart.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authoredCurriculaSql, contentMigrationFile } from '../src/content/curricula/index.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', contentMigrationFile);
const result = authoredCurriculaSql();
if (!result.ok) {
  console.error('Curriculum is invalid; nothing written:\n' + result.issues.map((i) => `  - ${i}`).join('\n'));
  process.exit(1);
}
writeFileSync(out, result.sql, 'utf8');
console.log(`Wrote ${out}`);
