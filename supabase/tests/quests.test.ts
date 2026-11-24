import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, serviceStore, type TestDb } from './testDb.ts';
import { validateCurriculum } from '../../src/engine/learning/curriculum.ts';
import { curriculumSql } from '../../src/services/curriculum/curriculumSql.ts';
import { createLearningService } from '../../src/services/learning/learningService.ts';
import { createAiService } from '../../src/services/ai/aiService.ts';
import { createDevelopmentFixtures } from '../../src/services/ai/providerFromEnv.ts';
import { fixtureCurriculum } from '../../src/fixtures/fixtureCurriculumGenerator.ts';

/**
 * Quests end to end against the real migrations: built by the engine from the course, completed
 * only from real records, paid once, private to each player, and narrated once by the Game Master.
 */

const TEMPLATE = 'fixture-quests';
const CHECK = `${TEMPLATE}/intro-check`;
const LESSON = `${TEMPLATE}/intro-lesson`;
let t: TestDb;

type Body = Record<string, any>;
type QuestBody = { key: string; status: string; xp: number; objectives: { id: string; done: boolean }[]; story: unknown };

before(async () => {
  t = await createTestDb();
  const v = validateCurriculum(fixtureCurriculum({ subject: 'Astronomy' }, TEMPLATE), ['foundations', 'application']);
  assert.ok(v.ok);
  await t.db.exec(`
    insert into public.campaign_templates (id, subject, title, module, version) values ('${TEMPLATE}', 'Astronomy', 'Fixture: Astronomy', 'Fixture', 0);
    insert into public.campaign_sub_skills (template_id, attribute, name)
      select '${TEMPLATE}', a, 'Fixture ' || a from unnest(array['str','dex','con','int','wis','cha']) a;
    insert into public.competency_definitions (id, template_id, key, name, attribute) values
      ('${TEMPLATE}/foundations', '${TEMPLATE}', 'foundations', 'Foundations', 'int'),
      ('${TEMPLATE}/application', '${TEMPLATE}', 'application', 'Application', 'wis');
  `);
  await t.db.exec(curriculumSql(v.curriculum));
});

// The real clock: the database stamps attempts with its own now(), so a fixed test date breaks once it is past.
const learning = () => createLearningService(serviceStore(t), { now: () => new Date() });
const ai = () => createAiService(serviceStore(t), createDevelopmentFixtures(), { now: () => new Date(), sleep: async () => {} });

async function newPlayer() {
  const u = await t.createUser();
  await createCharacterAs(t, u);
  const campaignId = await t.asUser(u, async (tx) => (await tx.query<{ id: string }>(`insert into public.campaigns (template_id) values ($1) returning id`, [TEMPLATE])).rows[0]!.id);
  return { u, campaignId };
}

async function list(u: string, campaignId: string) {
  const r = await learning().handle(u, { action: 'list_quests', campaignId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { quests: QuestBody[]; newlyCompleted: { key: string; xp: number }[] };
}

const questWith = (quests: QuestBody[], activityId: string) => quests.find((q) => q.objectives.some((o) => o.id === activityId))!;
const xpTotal = (u: string) => t.asUser(u, async (tx) => (await tx.query<{ total_xp: number }>('select total_xp from public.characters')).rows[0]!.total_xp);
const questXp = (u: string) => t.asUser(u, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from public.xp_transactions where kind = 'quest_completed'`)).rows[0]!.n);

async function finishFirstQuest(u: string, campaignId: string) {
  const svc = learning();
  assert.equal((await svc.handle(u, { action: 'complete_lesson', campaignId, activityId: LESSON })).status, 200);
  const start = await svc.handle(u, { action: 'start_check', campaignId, activityId: CHECK });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const answers = Object.fromEntries((start.body.items as { key: string }[]).map((i) => [i.key, 'a']));
  const submit = await svc.handle(u, { action: 'submit_check', attemptId: (start.body as Body).attemptId, answers });
  assert.equal((submit.body as Body).passed, true, 'the fixture answers "a" are correct');
}

describe('Quests (database + service)', () => {
  it('lists the course’s quests for a new player, with nothing completed and no XP', async () => {
    const { u, campaignId } = await newPlayer();
    const { quests, newlyCompleted } = await list(u, campaignId);
    const first = questWith(quests, LESSON);
    assert.ok(first, 'a learning quest covers the first lesson');
    assert.equal(first.status, 'active');
    assert.ok(first.objectives.some((o) => o.id === CHECK));
    assert.deepEqual(newlyCompleted, []);
    assert.equal(await questXp(u), 0);
  });

  it('completes a quest from real records and pays its XP exactly once', async () => {
    const { u, campaignId } = await newPlayer();
    await finishFirstQuest(u, campaignId);
    const before = await xpTotal(u);
    const first = await list(u, campaignId);
    const key = questWith(first.quests, LESSON).key;
    assert.deepEqual(first.newlyCompleted.map((q) => [q.key, q.xp]), [[key, 40]]);
    assert.equal(questWith(first.quests, LESSON).status, 'completed');
    assert.equal(await xpTotal(u), before + 40);

    const again = await list(u, campaignId);
    assert.deepEqual(again.newlyCompleted, []);
    assert.equal(await xpTotal(u), before + 40, 'listing again pays nothing');
    assert.equal(await questXp(u), 1);
  });

  it('records nothing while the campaign is paused', async () => {
    const { u, campaignId } = await newPlayer();
    await finishFirstQuest(u, campaignId);
    await t.asRole('service_role', (tx) => tx.query(`update public.campaigns set status = 'paused' where id = $1`, [campaignId]));
    const { quests, newlyCompleted } = await list(u, campaignId);
    assert.equal(questWith(quests, LESSON).status, 'ready');
    assert.deepEqual(newlyCompleted, []);
    assert.equal(await questXp(u), 0);
  });

  it('keeps quests private and lets no player record them', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    await finishFirstQuest(a.u, a.campaignId);
    await list(a.u, a.campaignId);
    assert.equal((await learning().handle(b.u, { action: 'list_quests', campaignId: a.campaignId })).status, 404);
    const seen = await t.asUser(b.u, async (tx) => (await tx.query('select * from public.quest_completions')).rows.length);
    assert.equal(seen, 0);
    assert.match((await t.errorAsUser(a.u, `insert into public.quest_completions (campaign_id, quest_key, user_id, snapshot) values ($1, 'x', $2, '{}')`, [a.campaignId, a.u])) ?? '', /permission denied/);
    assert.match((await t.errorAsUser(a.u, `select public.learning_record_quests($1, $2, '[]')`, [a.u, a.campaignId])) ?? '', /permission denied/);
  });

  it('the database refuses quest XP that doesn’t match the quest', async () => {
    const { u, campaignId } = await newPlayer();
    const bad = [{ questKey: 'learn-x', snapshot: {}, xp: { kind: 'quest_completed', sourceId: `${campaignId}/other`, amount: 9999, idempotencyKey: 'quest_completed:x', configVersion: 'v' } }];
    const err = await t.asRole('service_role', async (tx) => {
      try {
        await tx.query('select public.learning_record_quests($1, $2, $3)', [u, campaignId, JSON.stringify(bad)]);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    assert.match(err ?? '', /XP not allowed/);
  });

  it('the Game Master tells a quest’s story once, labelled, and it is saved', async () => {
    const { u, campaignId } = await newPlayer();
    const key = questWith((await list(u, campaignId)).quests, LESSON).key;
    const first = await ai().handle(u, { action: 'narrate_quest', campaignId, questKey: key });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const story = (first.body as { story: { origin: string; choices: { actionId: string }[] }; saved: boolean });
    assert.equal(story.story.origin, 'fixture');
    assert.deepEqual(story.story.choices.map((c) => c.actionId), ['begin', 'later']);
    assert.equal(story.saved, false);

    const second = await ai().handle(u, { action: 'narrate_quest', campaignId, questKey: key });
    assert.equal((second.body as { saved: boolean }).saved, true);
    const requests = await t.asUser(u, async (tx) => (await tx.query('select * from public.ai_requests')).rows.length);
    assert.equal(requests, 1, 'the saved story costs nothing');
    assert.ok(questWith((await list(u, campaignId)).quests, LESSON).story, 'the list includes the story');
  });

  it('refuses stories for unknown or locked quests', async () => {
    const { u, campaignId } = await newPlayer();
    assert.equal((await ai().handle(u, { action: 'narrate_quest', campaignId, questKey: 'learn-nothing' })).status, 404);
    const locked = (await list(u, campaignId)).quests.find((q) => q.status === 'locked');
    if (locked) assert.equal((await ai().handle(u, { action: 'narrate_quest', campaignId, questKey: locked.key })).status, 409);
  });
});
