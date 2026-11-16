import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './testDb.ts';
import { backgrounds, classes, races, tinctures } from '../../src/content/character/options.ts';
import { campaignTemplates } from '../../src/content/campaigns/catalog.ts';
import { achievements } from '../../src/content/achievements.ts';
import { xpActivityKinds } from '../../src/engine/progression/config.ts';
import { authoredCurricula, authoredCurriculaSql, contentMigrationFile } from '../../src/content/curricula/index.ts';
import { listActivities, validateCurriculum } from '../../src/engine/learning/curriculum.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The database seed and the app's content files must never drift apart. */

let t: TestDb;
before(async () => {
  t = await createTestDb();
});

const rows = async <T>(sql: string) => (await t.db.query<T>(sql)).rows;
const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

describe('content in the database matches src/content', () => {
  it('races, classes, backgrounds and tinctures', async () => {
    for (const [table, list] of [['races', races], ['classes', classes], ['backgrounds', backgrounds], ['tinctures', tinctures]] as const) {
      const db = await rows<{ id: string; name: string }>(`select id, name from public.${table} order by id`);
      assert.deepEqual(db, byId(list.map((x) => ({ id: x.id, name: x.name }))), table);
    }
  });

  it('starting gear for every background', async () => {
    const db = await rows<{ background_id: string; name: string }>(
      `select bsi.background_id, i.name from public.background_starting_items bsi join public.items i on i.id = bsi.item_id order by 1, 2`,
    );
    const expected = backgrounds.flatMap((b) => b.startingGear.map((name) => ({ background_id: b.id, name }))).sort(
      (a, b) => a.background_id.localeCompare(b.background_id) || a.name.localeCompare(b.name),
    );
    assert.deepEqual(db, expected);
  });

  it('achievements', async () => {
    const db = await rows<{ id: string; name: string; description: string }>('select id, name, description from public.achievements order by id');
    assert.deepEqual(db, byId(achievements.map((a) => ({ ...a }))));
  });

  it('campaign templates, sub-skills and competencies', async () => {
    for (const tmpl of campaignTemplates) {
      const [db] = await rows<{ subject: string; title: string; module: string; version: number }>(
        `select subject, title, module, version from public.campaign_templates where id = '${tmpl.id}'`,
      );
      assert.deepEqual(db, { subject: tmpl.subject, title: tmpl.title, module: tmpl.module, version: tmpl.curriculumVersion });
      const skills = await rows<{ attribute: string; name: string }>(`select attribute, name from public.campaign_sub_skills where template_id = '${tmpl.id}' order by attribute`);
      assert.deepEqual(skills, Object.entries(tmpl.subSkills).map(([attribute, name]) => ({ attribute, name })).sort((a, b) => a.attribute.localeCompare(b.attribute)));
      const comps = await rows<{ key: string; name: string; attribute: string }>(`select key, name, attribute from public.competency_definitions where template_id = '${tmpl.id}' order by key`);
      assert.deepEqual(comps, tmpl.competencies.map((c) => ({ ...c })).sort((a, b) => a.key.localeCompare(b.key)));
    }
  });

  it('the ledger accepts exactly the engine’s XP kinds', async () => {
    const [def] = await rows<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.xp_transactions'::regclass and conname like '%kind%'`,
    );
    const inDb = [...(def?.def ?? '').matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    assert.deepEqual(inDb, [...xpActivityKinds].sort());
  });

  it('authored curricula: the migration is exactly what `npm run content:sql` generates', () => {
    const generated = authoredCurriculaSql();
    assert.ok(generated.ok, generated.ok ? '' : generated.issues.join('\n'));
    const file = readFileSync(join(here, '..', 'migrations', contentMigrationFile), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(file, generated.sql, 'Run `npm run content:sql` and commit the result.');
  });

  it('authored curricula are loaded: every activity and question is in the database', async () => {
    for (const input of authoredCurricula) {
      const v = validateCurriculum(input);
      assert.ok(v.ok);
      const acts = listActivities(v.curriculum);
      const [db] = await rows<{ a: number; q: number }>(
        `select (select count(*)::int from public.learning_activities where template_id = '${input.templateId}') as a,
                (select count(*)::int from public.assessment_items i join public.learning_activities la on la.id = i.activity_id where la.template_id = '${input.templateId}') as q`,
      );
      assert.equal(db!.a, acts.length);
      assert.equal(db!.q, acts.reduce((n, { activity }) => n + (activity.kind === 'assessment' ? activity.items.length : 0), 0));
    }
  });
});

describe('answer keys stay out of the app', () => {
  it('no screen, layout or app file imports the server-side curricula', () => {
    const src = join(here, '..', '..', 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
          const rel = relative(src, path).replace(/\\/g, '/');
          if (rel.startsWith('content/curricula/')) continue;
          if (/content\/curricula/.test(readFileSync(path, 'utf8'))) offenders.push(rel);
        }
      }
    };
    walk(src);
    assert.deepEqual(offenders, []);
  });
});
