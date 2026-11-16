import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, serviceStore, type TestDb } from './testDb.ts';
import { HOUR_MS } from '../../src/engine/learning/config.ts';
import type { WrittenItem } from '../../src/engine/learning/curriculum.ts';
import { createLearningService } from '../../src/services/learning/learningService.ts';
import { createExaminer } from '../../src/services/ai/examinerService.ts';
import { createFixtureProvider } from '../../src/services/ai/fixtureProvider.ts';
import { createDevelopmentFixtures } from '../../src/services/ai/providerFromEnv.ts';
import type { ExaminerJudgement } from '../../src/services/ai/roles/examiner.ts';
import { AiError, type AiProvider } from '../../src/services/ai/types.ts';

/**
 * Written answers end to end, against the real migrations and the real Mesopotamia content: the
 * learning service with an Examiner, the engine's "doesn't count" rule, and the database's own
 * refusals. The Examiner here is a scripted fixture; no AI is called.
 */

const TEMPLATE = 'history-early-civilizations';
const LAND = `${TEMPLATE}/check-the-land`;
const ADV_GEO = `${TEMPLATE}/check-advanced-geography`;
const GEO = `${TEMPLATE}/geography`;

let t: TestDb;
const store = () => serviceStore(t);

type Body = Record<string, any>;

/** A scripted Examiner: judges every written answer the same way. */
function scripted(judge: (item: WrittenItem, answer: string) => Omit<ExaminerJudgement, 'feedback'> | 'fail'): AiProvider {
  return createFixtureProvider({
    examiner: (req) => {
      const hint = req.fixtureHint as { item: unknown; answer: string };
      const item = hint.item as WrittenItem;
      const r = judge(item, hint.answer);
      if (r === 'fail') throw new AiError('unavailable', 'provider down');
      return { ...r, feedback: 'Scripted test feedback.' };
    },
  });
}
const allMet = scripted((item, answer) => ({
  criteria: item.criteria.map((_, i) => ({ criterion: `C${i + 1}`, met: true, quote: answer.slice(0, 12) })),
  confidence: 'high',
  errorCategory: 'none',
}));
const unsure = scripted((item, answer) => ({
  criteria: item.criteria.map((_, i) => ({ criterion: `C${i + 1}`, met: true, quote: answer.slice(0, 12) })),
  confidence: 'medium',
  errorCategory: 'none',
}));
const down = scripted(() => 'fail');

function serviceAt(start: Date, provider: AiProvider | null) {
  let now = start;
  const clock = () => now;
  const examiner = provider ? createExaminer(store(), provider, { now: clock, sleep: async () => {} }) : null;
  const svc = createLearningService(store(), { now: clock, examiner });
  return { svc, advanceHours: (h: number) => (now = new Date(now.getTime() + h * HOUR_MS)) };
}

async function newPlayer() {
  const u = await t.createUser();
  await createCharacterAs(t, u);
  const campaignId = await t.asUser(u, async (tx) => (await tx.query<{ id: string }>(`insert into public.campaigns (template_id) values ($1) returning id`, [TEMPLATE])).rows[0]!.id);
  return { u, campaignId };
}

/** The right answers for issued questions (read as the database owner, never by the app). */
async function correctAnswers(items: { key: string; kind: string }[]) {
  const { rows } = await t.db.query<{ id: string; definition: Record<string, unknown> }>(`select id, definition from public.assessment_items where id = any ($1::text[])`, [items.map((i) => i.key)]);
  const byId = new Map(rows.map((r) => [r.id, r.definition] as const));
  return Object.fromEntries(items.map((i) => [i.key, i.kind === 'written' ? 'Rain was scarce in the south, so farmers dug canals from the rivers.' : byId.get(i.key)!.answer])) as Record<string, any>;
}

async function take(svc: ReturnType<typeof createLearningService>, u: string, campaignId: string, activityId: string, override: Record<string, unknown> = {}) {
  const start = await svc.handle(u, { action: 'start_check', campaignId, activityId });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const items = start.body.items as { key: string; kind: string }[];
  const answers = { ...(await correctAnswers(items)), ...override };
  const submit = await svc.handle(u, { action: 'submit_check', attemptId: start.body.attemptId, answers });
  return { start: start.body as Body, items, answers, submit: submit as { status: number; body: Body } };
}

const setStage = (campaignId: string, competency: string, stage: number) =>
  t.db.query(`update public.competency_progress set mastery_stage = $1 where campaign_id = $2 and competency_id = $3`, [stage, campaignId, competency]);
const stageOf = async (campaignId: string, competency = GEO) =>
  (await t.db.query<{ mastery_stage: number }>(`select mastery_stage from public.competency_progress where campaign_id = $1 and competency_id = $2`, [campaignId, competency])).rows[0]!.mastery_stage;
const xpOf = async (u: string) => (await t.db.query<{ total_xp: number }>(`select total_xp from public.characters where user_id = $1`, [u])).rows[0]!.total_xp;

before(async () => {
  t = await createTestDb();
});

describe('written questions with the Examiner', () => {
  it('issues the written question last, without its rubric or model answer', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date(), allMet);
    const res = await svc.handle(u, { action: 'start_check', campaignId, activityId: LAND });
    assert.equal(res.status, 200);
    const items = res.body.items as { kind: string; maxChars?: number }[];
    assert.equal(items.length, 5);
    assert.equal(items.at(-1)!.kind, 'written');
    assert.equal(items.at(-1)!.maxChars, 1200);
    const shown = JSON.stringify(items);
    for (const secret of ['criteria', 'passPoints', 'modelAnswer', 'feed a large population']) assert.ok(!shown.includes(secret), secret);
  });

  it('a confidently marked pass counts: XP, retention, and the rubric shown afterwards', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date(), allMet);
    const { submit } = await take(svc, u, campaignId, LAND);
    assert.equal(submit.status, 200, JSON.stringify(submit.body));
    assert.equal(submit.body.counted, true);
    assert.equal(submit.body.passed, true);
    assert.equal(submit.body.examinerOrigin, 'fixture');
    const w = (submit.body.results as Body[]).find((r) => r.written)!;
    assert.ok(w.written.criteria.every((c: Body) => c.met && c.description && c.quote));
    assert.equal(w.written.feedback, 'Scripted test feedback.');
    assert.ok(typeof w.answer === 'string' && w.answer.length > 20, 'model answer shown after marking');
    assert.equal(await xpOf(u), 15);

    const [attempt] = (await t.db.query<{ counted: boolean; marking: Body }>(`select counted, marking from public.assessment_attempts where user_id = $1`, [u])).rows;
    assert.equal(attempt!.counted, true);
    assert.equal(attempt!.marking.origin, 'fixture');
    const logged = await t.db.query<{ role: string; status: string }>(`select role, status from public.ai_requests where user_id = $1`, [u]);
    assert.deepEqual(logged.rows, [{ role: 'examiner', status: 'ok' }]);
  });

  it('an unsure mark: the attempt is kept but changes nothing, and cannot be resubmitted', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date(), unsure);
    const { start, answers, submit } = await take(svc, u, campaignId, LAND);
    assert.equal(submit.status, 200);
    assert.equal(submit.body.counted, false);
    assert.equal(submit.body.passed, false);
    assert.equal(submit.body.xp.total, 0);
    assert.equal(await xpOf(u), 0);
    const progress = (await t.db.query<Body>(`select mastery_stage, evidence_count, next_review_at from public.competency_progress where campaign_id = $1 and competency_id = $2`, [campaignId, GEO])).rows[0]!;
    assert.deepEqual(progress, { mastery_stage: 1, evidence_count: 0, next_review_at: null });
    assert.equal((await t.db.query(`select 1 from public.weakness_records where campaign_id = $1`, [campaignId])).rows.length, 0);
    assert.equal((await t.db.query(`select 1 from public.concept_progress where campaign_id = $1`, [campaignId])).rows.length, 0);
    const again = await svc.handle(u, { action: 'submit_check', attemptId: start.attemptId, answers });
    assert.equal(again.status, 409);
  });

  it('when the Examiner fails, nothing is recorded and the same answers can be submitted again', async () => {
    const { u, campaignId } = await newPlayer();
    const failing = serviceAt(new Date(), down);
    const { start, answers, submit } = await take(failing.svc, u, campaignId, LAND);
    assert.equal(submit.status, 503);
    assert.equal(submit.body.code, 'unavailable');
    const [row] = (await t.db.query<{ submitted_at: string | null }>(`select submitted_at from public.assessment_attempts where id = $1`, [start.attemptId])).rows;
    assert.equal(row!.submitted_at, null);
    const working = serviceAt(new Date(), allMet);
    const retry = await working.svc.handle(u, { action: 'submit_check', attemptId: start.attemptId, answers });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.counted, true);
  });

  it('a blank written answer is simply wrong and needs no Examiner request', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date(), down);
    const start = await svc.handle(u, { action: 'start_check', campaignId, activityId: LAND });
    const items = start.body.items as { key: string; kind: string }[];
    const answers = { ...(await correctAnswers(items)), [items.at(-1)!.key]: '   ' };
    const submit = await svc.handle(u, { action: 'submit_check', attemptId: start.body.attemptId, answers });
    assert.equal(submit.status, 200);
    assert.equal(submit.body.counted, true);
    assert.equal(submit.body.correct, 4);
    assert.equal(submit.body.passed, true, '4 of 5 is a pass');
    assert.equal((await t.db.query(`select 1 from public.ai_requests where user_id = $1`, [u])).rows.length, 0);
  });
});

describe('without the Examiner', () => {
  it('checks up to Proficient leave the written question out; Advanced checks wait', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date(), null);
    const land = await svc.handle(u, { action: 'start_check', campaignId, activityId: LAND });
    assert.equal(land.status, 200);
    assert.ok((land.body.items as { kind: string }[]).every((i) => i.kind !== 'written'));
    assert.equal((land.body.items as object[]).length, 5);

    await setStage(campaignId, GEO, 4);
    const adv = await svc.handle(u, { action: 'start_check', campaignId, activityId: ADV_GEO });
    assert.equal(adv.status, 503);
    assert.equal(adv.body.code, 'examiner_unavailable');
  });

  it('a player out of AI requests gets the check without its written question', async () => {
    const { u, campaignId } = await newPlayer();
    await t.db.query(`insert into public.ai_requests (user_id, role, status) select $1, 'tutor', 'ok' from generate_series(1, 30)`, [u]);
    const { svc } = serviceAt(new Date(), allMet);
    const land = await svc.handle(u, { action: 'start_check', campaignId, activityId: LAND });
    assert.equal(land.status, 200);
    assert.ok((land.body.items as { kind: string }[]).every((i) => i.kind !== 'written'));
  });
});

describe('Advanced (stage 5) needs confidently marked written work', () => {
  it('two confident passes on separate days reach Advanced', async () => {
    const { u, campaignId } = await newPlayer();
    await setStage(campaignId, GEO, 4);
    const { svc, advanceHours } = serviceAt(new Date(), allMet);
    const first = await take(svc, u, campaignId, ADV_GEO);
    assert.equal(first.items.length, 2);
    assert.ok(first.items.every((i) => i.kind === 'written'));
    assert.equal(first.submit.body.passed, true);
    assert.equal(await stageOf(campaignId), 4);
    advanceHours(24);
    const second = await take(svc, u, campaignId, ADV_GEO);
    assert.equal(second.submit.body.competencies[0].advanced, true);
    assert.equal(await stageOf(campaignId), 5);
  });

  it('the database refuses Advanced without the Examiner’s marking, and uncounted attempts that change progress', async () => {
    const { u, campaignId } = await newPlayer();
    await setStage(campaignId, GEO, 4);
    const { svc } = serviceAt(new Date(), allMet);
    const start = await svc.handle(u, { action: 'start_check', campaignId, activityId: ADV_GEO });
    const items = start.body.items as { key: string }[];
    const results = items.map((i) => ({ itemId: i.key, conceptId: `${TEMPLATE}/alluvial-plain`, correct: true }));
    const answers = Object.fromEntries(items.map((i) => [i.key, 'An answer long enough to need marking.']));
    const forged = (over: object) =>
      store().call('learning_record_submission', {
        p_user_id: u,
        p_attempt_id: start.body.attemptId,
        p_outcome: { submittedAt: new Date().toISOString(), answers, results, correct: 2, total: 2, score: 1, passed: true, competencies: [], weaknesses: [], attributes: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, xp: [], ...over },
      });
    await assert.rejects(forged({ competencies: [{ competencyId: GEO, stage: 5 }] }), /written answers need the Examiner/);
    await assert.rejects(forged({ counted: false, passed: false, xp: [{ kind: 'knowledge_check_passed', sourceId: ADV_GEO, amount: 15, idempotencyKey: 'k', configVersion: 'v' }] }), /uncounted check cannot change progress/);
    await assert.rejects(forged({ counted: false, passed: true }), /uncounted|assessment_attempts_uncounted_not_passed/);
    assert.equal(await stageOf(campaignId), 4);
  });
});

describe('development fixture Examiner', () => {
  it('is labelled as a fixture and marks by key words', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date(), createDevelopmentFixtures());
    const { submit } = await take(svc, u, campaignId, LAND);
    assert.equal(submit.status, 200, JSON.stringify(submit.body));
    assert.equal(submit.body.examinerOrigin, 'fixture');
    const w = (submit.body.results as Body[]).find((r) => r.written)!;
    assert.match(w.written.feedback, /Development fixture/);
  });
});
