import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './testDb.ts';
import { backgrounds, classes, races, tinctures } from '../../src/content/character/options.ts';
import { campaignTemplates } from '../../src/content/campaigns/catalog.ts';
import { achievements } from '../../src/content/achievements.ts';
import { xpActivityKinds } from '../../src/engine/progression/config.ts';

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
});
