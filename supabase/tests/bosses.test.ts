import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, serviceStore, type TestDb } from './testDb.ts';
import { validateCurriculum } from '../../src/engine/learning/curriculum.ts';
import { curriculumSql } from '../../src/services/curriculum/curriculumSql.ts';
import { createLearningService } from '../../src/services/learning/learningService.ts';
import { createBossPlanner } from '../../src/services/ai/bossPlanner.ts';
import { createDevelopmentFixtures } from '../../src/services/ai/providerFromEnv.ts';
import { fixtureCurriculum } from '../../src/fixtures/fixtureCurriculumGenerator.ts';

/**
 * Boss battles end to end against the real migrations: the gate, the battle (answers in order,
 * Resolve, win and loss), XP paid once, defeat taking nothing away, recovery, and privacy.
 * In the fixture course, option "a" is always right and "b" always wrong.
 */

const TEMPLATE = 'fixture-bosses';
const FOUND = `${TEMPLATE}/foundations`;
const APPLY = `${TEMPLATE}/application`;
const FIRST_CHECK = `${TEMPLATE}/intro-check`;
const HARD_CHECK = `${TEMPLATE}/apply-check`; // Competent (stage 3)
let t: TestDb;

type Body = Record<string, any>;

before(async () => {
  t = await createTestDb();
  const v = validateCurriculum(fixtureCurriculum({ subject: 'Astronomy' }, TEMPLATE), ['foundations', 'application']);
  assert.ok(v.ok);
  await t.db.exec(`
    insert into public.campaign_templates (id, subject, title, module, version) values ('${TEMPLATE}', 'Astronomy', 'Fixture: Astronomy', 'Fixture', 0);
    insert into public.campaign_sub_skills (template_id, attribute, name)
      select '${TEMPLATE}', a, 'Fixture ' || a from unnest(array['str','dex','con','int','wis','cha']) a;
    insert into public.competency_definitions (id, template_id, key, name, attribute) values
      ('${FOUND}', '${TEMPLATE}', 'foundations', 'Foundations', 'int'),
      ('${APPLY}', '${TEMPLATE}', 'application', 'Application', 'wis');
  `);
  await t.db.exec(curriculumSql(v.curriculum));
});

const svc = (withPlanner = false) =>
  createLearningService(serviceStore(t), { bossPlanner: withPlanner ? createBossPlanner(serviceStore(t), createDevelopmentFixtures(), { sleep: async () => {} }) : null });

/** Battle-rule tests use a Human Ranger: both of their powers are ones the player chooses to use. */
async function newPlayer(stages: Record<string, number> = {}, race = 'human', cls = 'ranger', template = TEMPLATE) {
  const u = await t.createUser();
  await createCharacterAs(t, u, 'Enheduanna', 'scholar', race, cls);
  const campaignId = await t.asUser(u, async (tx) => (await tx.query<{ id: string }>(`insert into public.campaigns (template_id) values ($1) returning id`, [template])).rows[0]!.id);
  for (const [competency, stage] of Object.entries(stages)) {
    await t.db.query(
      `insert into public.competency_progress (campaign_id, competency_id, user_id, mastery_stage) values ($1, $2, $3, $4)
       on conflict (campaign_id, competency_id) do update set mastery_stage = excluded.mastery_stage`,
      [campaignId, competency, u, stage],
    );
  }
  return { u, campaignId };
}

async function bosses(u: string, campaignId: string) {
  const r = await svc().handle(u, { action: 'list_bosses', campaignId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body as { bosses: { stage: number; status: string; reason?: string; recovery?: Body }[] }).bosses;
}

/** Plays a whole battle with the given answers ('a' right, 'b' wrong); returns the last reply. */
async function play(u: string, campaignId: string, answers: string[], withPlanner = false) {
  const s = svc(withPlanner);
  const start = await s.handle(u, { action: 'start_boss', campaignId, stage: 2 });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  let last: Body = start.body;
  for (const a of answers) {
    if (last.encounter.status !== 'active') break;
    const r = await s.handle(u, { action: 'answer_boss', encounterId: last.encounter.id, position: last.encounter.position, answer: a });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    last = r.body;
  }
  return { start: start.body as Body, last };
}

const xpOf = async (u: string) => (await t.db.query<{ total_xp: number }>(`select total_xp from public.characters where user_id = $1`, [u])).rows[0]!.total_xp;
const bossXp = async (u: string) => (await t.db.query<{ n: number }>(`select count(*)::int as n from public.xp_transactions where user_id = $1 and kind = 'boss_defeated'`, [u])).rows[0]!.n;
const itemsOf = async (activityId: string) => (await t.db.query<{ id: string }>(`select id from public.assessment_items where activity_id = $1 order by position`, [activityId])).rows.map((r) => r.id);
const stageOf = async (campaignId: string, competency = FOUND) =>
  (await t.db.query<{ mastery_stage: number }>(`select mastery_stage from public.competency_progress where campaign_id = $1 and competency_id = $2`, [campaignId, competency])).rows[0]?.mastery_stage ?? 1;

async function passFirstCheck(u: string, campaignId: string) {
  const s = svc();
  const start = await s.handle(u, { action: 'start_check', campaignId, activityId: FIRST_CHECK });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const answers = Object.fromEntries((start.body.items as { key: string }[]).map((i) => [i.key, 'a']));
  const submit = await s.handle(u, { action: 'submit_check', attemptId: (start.body as Body).attemptId, answers });
  assert.equal((submit.body as Body).passed, true);
}

describe('Boss gate', () => {
  it('a new player’s bosses are locked, and the Competent boss waits for the Apprentice boss', async () => {
    const { u, campaignId } = await newPlayer();
    const list = await bosses(u, campaignId);
    assert.deepEqual(list.map((b) => [b.stage, b.status]), [[2, 'locked'], [3, 'locked']]);
    assert.match(list[1]!.reason!, /Apprentice boss/);
    const start = await svc().handle(u, { action: 'start_boss', campaignId, stage: 2 });
    assert.equal(start.status, 409);
  });

  it('Competent checks are refused until the Apprentice boss is beaten, by the server and the database', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2, [APPLY]: 2 });
    const r = await svc().handle(u, { action: 'start_check', campaignId, activityId: HARD_CHECK });
    assert.equal(r.status, 403);
    assert.equal((r.body as Body).code, 'boss_gate');
    // Even a direct call (skipping the server's check) is refused by the database.
    await assert.rejects(
      serviceStore(t).call('learning_create_attempt', { p_user_id: u, p_campaign_id: campaignId, p_activity_id: HARD_CHECK, p_item_ids: (await itemsOf(HARD_CHECK)).slice(0, 2), p_difficulty: 2, p_issued_items: [] }),
      /beat the boss of the stage below/,
    );
  });

  it('a higher boss can’t be created before the one below is won', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 3, [APPLY]: 3 });
    await assert.rejects(
      serviceStore(t).call('boss_create_encounter', { p_user_id: u, p_campaign_id: campaignId, p_stage: 3, p_plan: {}, p_origin: 'game', p_question_ids: (await itemsOf(FIRST_CHECK)).slice(0, 3), p_max_resolve: 3 }),
      /previous boss not beaten/,
    );
  });
});

describe('Boss battle', () => {
  it('a ready player can start; the question carries no answer key; starting again resumes', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2 });
    assert.equal((await bosses(u, campaignId))[0]!.status, 'ready');
    const first = await svc().handle(u, { action: 'start_boss', campaignId, stage: 2 });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const b = first.body as Body;
    assert.equal(b.encounter.planOrigin, 'game');
    assert.equal(b.encounter.resolve, 3);
    assert.equal(b.encounter.plan.victory, null, 'the outcome text is hidden until the battle ends');
    assert.equal('answer' in b.question, false);
    assert.equal('explanation' in b.question, false);
    const again = await svc().handle(u, { action: 'start_boss', campaignId, stage: 2 });
    assert.equal((again.body as Body).encounter.id, b.encounter.id);
    assert.equal((await bosses(u, campaignId))[0]!.status, 'active');
  });

  it('the Strategist’s plan is used when it follows the rules, and labelled as a fixture', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2 });
    const { start } = await play(u, campaignId, [], true);
    assert.equal(start.encounter.planOrigin, 'fixture');
    const logged = (await t.db.query<{ n: number }>(`select count(*)::int as n from public.ai_requests where user_id = $1 and role = 'strategist'`, [u])).rows[0]!.n;
    assert.equal(logged, 1);
  });

  it('a victory pays its XP once and opens the Competent checks', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2, [APPLY]: 2 });
    const before = await xpOf(u);
    const { last } = await play(u, campaignId, ['a', 'b', 'a', 'a', 'a', 'a']);
    assert.equal(last.encounter.status, 'won');
    assert.equal(last.encounter.resolve, 2);
    assert.equal(last.result.xp, 200);
    assert.ok(last.encounter.plan.victory);
    assert.equal(await xpOf(u), before + 200);
    assert.equal(await bossXp(u), 1);

    // The reward can't be paid again, even by replaying the record directly.
    await assert.rejects(svc().handle(u, { action: 'answer_boss', encounterId: last.encounter.id, position: last.encounter.position - 1, answer: 'a' }).then((r) => {
      if (r.status !== 200) throw new Error(String(r.status));
    }));
    assert.equal(await bossXp(u), 1);
    assert.equal((await bosses(u, campaignId))[0]!.status, 'won');
    assert.equal((await svc().handle(u, { action: 'start_check', campaignId, activityId: HARD_CHECK })).status, 200);
  });

  it('a defeat takes nothing away, puts mistakes in the Weakness Bank, and asks for recovery', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2 });
    const before = await xpOf(u);
    const { last } = await play(u, campaignId, ['b', 'b', 'b', 'a']);
    assert.equal(last.encounter.status, 'lost');
    assert.equal(last.encounter.resolve, 0);
    assert.equal(last.result.xp, 0);
    assert.ok(last.encounter.plan.defeat);
    assert.equal(await xpOf(u), before, 'no XP lost or gained');
    assert.equal(await stageOf(campaignId), 2, 'no stage lost');
    const weak = (await t.db.query<{ n: number }>(`select count(*)::int as n from public.weakness_records where campaign_id = $1 and status = 'open'`, [campaignId])).rows[0]!.n;
    assert.ok(weak >= 1);

    const status = (await bosses(u, campaignId))[0]!;
    assert.equal(status.status, 'recover');
    assert.equal((await svc().handle(u, { action: 'start_boss', campaignId, stage: 2 })).status, 409);

    // The recovery quest: no XP, completed by passing the check again, never recorded.
    const quests = async () => ((await svc().handle(u, { action: 'list_quests', campaignId })).body as { quests: { key: string; kind: string; status: string; xp: number }[] }).quests;
    const rec = (await quests()).find((q) => q.kind === 'recover')!;
    assert.equal(rec.key, 'recover-2-1');
    assert.equal(rec.xp, 0);
    assert.equal(rec.status, 'active');
    await passFirstCheck(u, campaignId);
    assert.equal((await quests()).find((q) => q.kind === 'recover')!.status, 'completed');
    const recorded = (await t.db.query<{ n: number }>(`select count(*)::int as n from public.quest_completions where campaign_id = $1 and quest_key like 'recover-%'`, [campaignId])).rows[0]!.n;
    assert.equal(recorded, 0);
    assert.equal((await bosses(u, campaignId))[0]!.status, 'ready', 'the boss can be faced again');
  });

  it('answers must come in order, once each', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2 });
    const { start } = await play(u, campaignId, []);
    const id = start.encounter.id;
    const ok = await svc().handle(u, { action: 'answer_boss', encounterId: id, position: 0, answer: 'a' });
    assert.equal(ok.status, 200);
    const twice = await svc().handle(u, { action: 'answer_boss', encounterId: id, position: 0, answer: 'a' });
    assert.equal(twice.status, 409);
  });

  it('the database refuses forged results: Resolve, outcome, XP', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2 });
    const { start } = await play(u, campaignId, []);
    const row = (await t.db.query<{ question_ids: string[] }>(`select question_ids from public.boss_encounters where id = $1`, [start.encounter.id])).rows[0]!;
    const record = (outcome: object) =>
      serviceStore(t).call('boss_record_answer', {
        p_user_id: u, p_encounter_id: start.encounter.id, p_position: 0,
        p_outcome: { itemId: row.question_ids[0], conceptId: `${TEMPLATE}/core-idea`, correct: true, given: 'a', resolve: 3, status: 'active', xp: null, weakness: null, ...outcome },
      });
    await assert.rejects(record({ correct: false, resolve: 3 }), /Resolve not allowed/);
    await assert.rejects(record({ status: 'won' }), /battle result not allowed/);
    await assert.rejects(record({ xp: { kind: 'boss_defeated', sourceId: 'x', amount: 9999, idempotencyKey: 'k', configVersion: 'v' } }), /XP only for a victory/);
    assert.equal(await bossXp(u), 0);
  });

  it('a check already passed stays open for reviews', async () => {
    const { u, campaignId } = await newPlayer({ [FOUND]: 2, [APPLY]: 2 });
    await play(u, campaignId, ['a', 'a', 'a', 'a', 'a', 'a']);
    const s = svc();
    const start = await s.handle(u, { action: 'start_check', campaignId, activityId: HARD_CHECK });
    const answers = Object.fromEntries((start.body.items as { key: string }[]).map((i) => [i.key, 'a']));
    assert.equal(((await s.handle(u, { action: 'submit_check', attemptId: (start.body as Body).attemptId, answers })).body as Body).passed, true);
    // As if the check had been passed before bosses existed: remove the win.
    await t.db.query(`delete from public.boss_encounters where campaign_id = $1`, [campaignId]);
    assert.equal((await s.handle(u, { action: 'start_check', campaignId, activityId: HARD_CHECK })).status, 200);
  });
});

describe('Boss privacy', () => {
  it('battles are private, and players can’t write or record them', async () => {
    const a = await newPlayer({ [FOUND]: 2 });
    const b = await newPlayer();
    const { start } = await play(a.u, a.campaignId, []);
    assert.equal((await svc().handle(b.u, { action: 'view_boss', encounterId: start.encounter.id })).status, 404);
    assert.equal((await svc().handle(b.u, { action: 'list_bosses', campaignId: a.campaignId })).status, 404);
    assert.equal(await t.asUser(b.u, async (tx) => (await tx.query('select * from public.boss_encounters')).rows.length), 0);
    assert.equal(await t.asUser(a.u, async (tx) => (await tx.query('select * from public.boss_encounters')).rows.length), 1);
    assert.match((await t.errorAsUser(a.u, `update public.boss_encounters set status = 'won'`)) ?? '', /permission denied/);
    assert.match((await t.errorAsUser(a.u, `select public.boss_record_answer($1, $2, 0, '{}')`, [a.u, start.encounter.id])) ?? '', /permission denied/);
    assert.match((await t.errorAsUser(a.u, `select public.boss_context($1, $2)`, [a.u, a.campaignId])) ?? '', /permission denied/);
  });
});
