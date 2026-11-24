import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, serviceStore, winBossesAs, type TestDb } from './testDb.ts';
import { HOUR_MS } from '../../src/engine/learning/config.ts';
import type { WrittenItem } from '../../src/engine/learning/curriculum.ts';
import { createLearningService } from '../../src/services/learning/learningService.ts';
import { createExaminer } from '../../src/services/ai/examinerService.ts';
import { createFixtureProvider } from '../../src/services/ai/fixtureProvider.ts';
import type { AiProvider } from '../../src/services/ai/types.ts';

/**
 * Practical projects end to end on the real Mesopotamia content (GAME_DESIGN.md "Practical
 * projects"): a project counts once toward Advanced, pays its reward once, opens at Proficient, and
 * the database refuses a stage rise made of project passes alone. The Examiner is scripted.
 */

const TEMPLATE = 'history-early-civilizations';
const PROJECT = `${TEMPLATE}/project-founding-a-village`;
const ADV_GEO = `${TEMPLATE}/check-advanced-geography`;
const GEO = `${TEMPLATE}/geography`;

let t: TestDb;
type Body = Record<string, any>;

const allMet: AiProvider = createFixtureProvider({
  examiner: (req) => {
    const { item, answer } = req.fixtureHint as { item: WrittenItem; answer: string };
    return { criteria: item.criteria.map((_, i) => ({ criterion: `C${i + 1}`, met: true, quote: answer.slice(0, 12) })), confidence: 'high', errorCategory: 'none', feedback: 'Scripted test feedback.' };
  },
});

function serviceFromNow() {
  // The real clock: the database stamps attempts with its own now().
  let now = new Date();
  const clock = () => now;
  const examiner = createExaminer(serviceStore(t), allMet, { now: clock, sleep: async () => {} });
  return { svc: createLearningService(serviceStore(t), { now: clock, examiner }), advanceHours: (h: number) => (now = new Date(now.getTime() + h * HOUR_MS)) };
}

async function newPlayer() {
  const u = await t.createUser();
  await createCharacterAs(t, u);
  const campaignId = await t.asUser(u, async (tx) => (await tx.query<{ id: string }>(`insert into public.campaigns (template_id) values ($1) returning id`, [TEMPLATE])).rows[0]!.id);
  return { u, campaignId };
}

const answer = 'Settle by the river and irrigate, because there is little rain; trade for wood, stone and metal; beware floods.';
async function take(svc: ReturnType<typeof createLearningService>, u: string, campaignId: string, activityId: string) {
  const start = await svc.handle(u, { action: 'start_check', campaignId, activityId });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const items = start.body.items as { key: string; kind: string }[];
  const { rows } = await t.db.query<{ id: string; definition: Record<string, unknown> }>(`select id, definition from public.assessment_items where id = any ($1::text[])`, [items.map((i) => i.key)]);
  const key = new Map(rows.map((r) => [r.id, r.definition.answer] as const));
  const answers = Object.fromEntries(items.map((i) => [i.key, i.kind === 'written' ? answer : key.get(i.key)])) as Record<string, any>;
  const submit = await svc.handle(u, { action: 'submit_check', attemptId: start.body.attemptId, answers });
  assert.equal(submit.status, 200, JSON.stringify(submit.body));
  return { start: start.body as Body, items, submit: submit.body as Body };
}

const setStage = (campaignId: string, stage: number) =>
  t.db.query(`update public.competency_progress set mastery_stage = $1 where campaign_id = $2 and competency_id = $3`, [stage, campaignId, GEO]);
const stageOf = async (campaignId: string) =>
  (await t.db.query<{ mastery_stage: number }>(`select mastery_stage from public.competency_progress where campaign_id = $1 and competency_id = $2`, [campaignId, GEO])).rows[0]!.mastery_stage;
const xpRows = async (u: string) =>
  (await t.db.query<{ kind: string; amount: number }>(`select kind, amount from public.xp_transactions where user_id = $1 order by created_at`, [u])).rows;

before(async () => {
  t = await createTestDb();
});

describe('Practical projects (database + service)', () => {
  it('the pilot has one project per topic, each one written task proving Advanced', async () => {
    const { rows } = await t.db.query<{ key: string; target_stage: number; question_count: number; written_count: number; kinds: string[] }>(
      `select a.key, a.target_stage, a.question_count, a.written_count, array_agg(i.kind) as kinds
         from public.learning_activities a join public.assessment_items i on i.activity_id = a.id
        where a.template_id = $1 and a.is_project group by a.id order by a.key`, [TEMPLATE]);
    assert.deepEqual(rows.map((r) => r.key), ['project-founding-a-village', 'project-help-or-hindrance', 'project-museum-panel']);
    assert.ok(rows.every((r) => r.target_stage === 5 && r.question_count === 1 && r.written_count === 1 && r.kinds.join() === 'written'));
  });

  it('opens only at Proficient, behind the Proficient boss', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceFromNow();
    await setStage(campaignId, 3);
    await winBossesAs(t, u, campaignId);
    assert.notEqual((await svc.handle(u, { action: 'start_check', campaignId, activityId: PROJECT })).status, 200);
    await setStage(campaignId, 4);
    const start = await svc.handle(u, { action: 'start_check', campaignId, activityId: PROJECT });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.doesNotMatch(JSON.stringify(start.body), /modelAnswer|criteria|passPoints/, 'the rubric stays on the server');
  });

  it('counts once toward Advanced and pays 75 XP once; the second pass must be an Advanced check', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc, advanceHours } = serviceFromNow();
    await setStage(campaignId, 4);
    await winBossesAs(t, u, campaignId);

    const first = await take(svc, u, campaignId, PROJECT);
    assert.equal(first.submit.passed, true);
    assert.deepEqual((await xpRows(u)).map((x) => [x.kind, x.amount]), [['practical_project_completed', 75]]);
    assert.equal(await stageOf(campaignId), 4, 'one pass is not enough');

    advanceHours(30);
    assert.equal((await take(svc, u, campaignId, PROJECT)).submit.passed, true);
    assert.equal(await stageOf(campaignId), 4, 'a second project pass does not count again');
    assert.equal((await xpRows(u)).length, 1, 'and pays nothing');

    advanceHours(30);
    assert.equal((await take(svc, u, campaignId, ADV_GEO)).submit.passed, true);
    assert.equal(await stageOf(campaignId), 5, 'project + Advanced check on different days → Advanced');
  });

  it('the database refuses Advanced from project passes alone, and the wrong XP for a project', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceFromNow();
    await setStage(campaignId, 4);
    await winBossesAs(t, u, campaignId);
    await take(svc, u, campaignId, PROJECT);
    const start = await svc.handle(u, { action: 'start_check', campaignId, activityId: PROJECT });
    const item = (start.body.items as { key: string }[])[0]!.key;
    const forge = (extra: object) => t.asRole('service_role', (tx) => tx.query('select public.learning_record_submission($1, $2, $3::jsonb)', [u, start.body.attemptId, JSON.stringify({
      submittedAt: new Date().toISOString(), answers: { [item]: answer }, results: [{ itemId: item, conceptId: `${TEMPLATE}/low-rainfall`, correct: true }],
      correct: 1, total: 1, score: 1, passed: true, counted: true, marking: { items: {} }, weaknesses: [], competencies: [], xp: [],
      attributes: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, ...extra,
    })])).then(() => null, (e: Error) => e.message);
    assert.match((await forge({ competencies: [{ competencyId: GEO, stage: 5, evidence: true, reviewStep: 1, nextReviewAt: null, needsReview: false, lastDemonstratedAt: null, retentionStrength: null }] }))!, /project counts as one pass/);
    assert.match((await forge({ xp: [{ kind: 'knowledge_check_passed', sourceId: PROJECT, amount: 15, idempotencyKey: `knowledge_check_passed:${PROJECT}`, configVersion: '1' }] }))!, /XP not allowed/);
    assert.equal(await stageOf(campaignId), 4);
  });
});
