import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, type TestDb } from './testDb.ts';
import { validateCurriculum } from '../../src/engine/learning/curriculum.ts';
import { curriculumSql } from '../../src/services/curriculum/curriculumSql.ts';
import { createLearningService, StoreError, type LearningStore } from '../../src/services/learning/learningService.ts';
import { fixtureCurriculum } from '../../src/fixtures/fixtureCurriculumGenerator.ts';
import { HOUR_MS } from '../../src/engine/learning/config.ts';

/**
 * The learning loop end to end, against the real migrations: the engine (via the same service the
 * Edge Function runs) plus the database's own rules. Uses the labelled fixture curriculum.
 */

const TEMPLATE = 'fixture-astronomy';
const CHECK = `${TEMPLATE}/intro-check`;
const HARD_CHECK = `${TEMPLATE}/apply-check`;
const LESSON = `${TEMPLATE}/intro-lesson`;

let t: TestDb;

/** Calls the learning SQL functions as the service role, the way the Edge Function does. */
function store(db: TestDb): LearningStore {
  return {
    async call(fn, args) {
      const names = Object.keys(args);
      const values = names.map((n) => {
        const v = args[n];
        return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const params = names.map((n, i) => {
        const v = args[n];
        const cast = Array.isArray(v) && v.every((x) => typeof x === 'string') ? '::text[]' : v !== null && typeof v === 'object' ? '::jsonb' : '';
        return `${n} => $${i + 1}${cast}`;
      });
      try {
        return await db.asRole('service_role', async (tx) => (await tx.query<{ r: unknown }>(`select public.${fn}(${params.join(', ')}) as r`, values)).rows[0]?.r ?? null);
      } catch (err) {
        const e = err as { code?: string; message?: string };
        throw new StoreError(e.message ?? 'db error', e.code);
      }
    },
  };
}

/** A service whose clock the test controls. */
function serviceAt(start: Date) {
  let now = start;
  const svc = createLearningService(store(t), { now: () => now });
  return { svc, advanceHours: (h: number) => (now = new Date(now.getTime() + h * HOUR_MS)) };
}

async function newPlayer() {
  const u = await t.createUser();
  await createCharacterAs(t, u);
  const campaignId = await t.asUser(u, async (tx) => (await tx.query<{ id: string }>(`insert into public.campaigns (template_id) values ($1) returning id`, [TEMPLATE])).rows[0]!.id);
  return { u, campaignId };
}

type Body = Record<string, any>;
async function takeCheck(svc: ReturnType<typeof createLearningService>, u: string, campaignId: string, choose: 'a' | 'b', activityId = CHECK) {
  const start = await svc.handle(u, { action: 'start_check', campaignId, activityId });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const items = start.body.items as { key: string }[];
  const answers = Object.fromEntries(items.map((i) => [i.key, choose]));
  const submit = await svc.handle(u, { action: 'submit_check', attemptId: start.body.attemptId, answers });
  return { start: start.body as Body, submit: submit as { status: number; body: Body } };
}

const progress = (u: string, competency = `${TEMPLATE}/foundations`) =>
  t.asUser(u, async (tx) => (await tx.query<Record<string, any>>(`select * from public.competency_progress where competency_id = $1`, [competency])).rows[0]!);
const xpTotal = (u: string) => t.asUser(u, async (tx) => (await tx.query<{ total_xp: number }>('select total_xp from public.characters')).rows[0]!.total_xp);

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

describe('curriculum storage', () => {
  it('stores a validated curriculum and can re-apply it without deleting anything', async () => {
    const v = validateCurriculum(fixtureCurriculum({ subject: 'Astronomy' }, TEMPLATE));
    assert.ok(v.ok);
    await t.db.exec(curriculumSql(v.curriculum)); // second time: updates in place
    const { rows } = await t.db.query<{ n: number }>(`select count(*)::int as n from public.assessment_items where activity_id like '${TEMPLATE}/%'`);
    assert.equal(rows[0]!.n, 9);
    const tmpl = await t.db.query<{ version: number }>(`select version from public.campaign_templates where id = '${TEMPLATE}'`);
    assert.equal(tmpl.rows[0]!.version, 1);
  });

  it('lets signed-out visitors read lessons but nobody read answer keys', async () => {
    const lessons = await t.asRole('anon', (tx) => tx.query(`select title, sections from public.learning_activities where id = $1`, [LESSON]));
    assert.equal(lessons.rows.length, 1);
    const u = await t.createUser();
    assert.match((await t.errorAsUser(u, 'select definition from public.assessment_items')) ?? '', /permission denied/);
    const ok = await t.asUser(u, (tx) => tx.query('select id, difficulty from public.assessment_items limit 1'));
    assert.equal(ok.rows.length, 1);
  });
});

describe('the learning loop', () => {
  it('issues questions without answers and records the attempt', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    const res = await svc.handle(u, { action: 'start_check', campaignId, activityId: CHECK });
    assert.equal(res.status, 200);
    const items = res.body.items as object[];
    assert.equal(items.length, 3);
    assert.ok(!JSON.stringify(items).includes('"answer"'));
    const own = await t.asUser(u, (tx) => tx.query<{ submitted_at: string | null }>('select submitted_at from public.assessment_attempts'));
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0]!.submitted_at, null);
  });

  it('a failed check records weaknesses, pays nothing and keeps the stage', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    const { submit } = await takeCheck(svc, u, campaignId, 'b');
    assert.equal(submit.status, 200);
    assert.equal(submit.body.passed, false);
    assert.equal(submit.body.xp.total, 0);
    assert.equal(await xpTotal(u), 0);
    const weak = await t.asUser(u, (tx) => tx.query<{ status: string; error_category: string }>('select status, error_category from public.weakness_records'));
    assert.ok(weak.rows.length >= 1);
    assert.ok(weak.rows.every((w) => w.status === 'open' && w.error_category === 'related_concept_confusion'));
    assert.equal((await progress(u)).mastery_stage, 1);
  });

  it('pays check XP on the first pass only, and advances the stage only on a second day', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc, advanceHours } = serviceAt(new Date());
    const first = await takeCheck(svc, u, campaignId, 'a');
    assert.equal(first.submit.body.passed, true);
    assert.equal(first.submit.body.xp.total, 15);
    assert.equal((await progress(u)).mastery_stage, 1);

    advanceHours(2);
    const sameDay = await takeCheck(svc, u, campaignId, 'a');
    assert.equal(sameDay.submit.body.xp.total, 0, 'no XP for repeating a passed check');
    assert.equal((await progress(u)).mastery_stage, 1, 'two passes on the same day are one day of evidence');

    advanceHours(24);
    const nextDay = await takeCheck(svc, u, campaignId, 'a');
    assert.equal(nextDay.submit.body.competencies[0].advanced, true);
    const p = await progress(u);
    assert.equal(p.mastery_stage, 2);
    assert.ok(p.evidence_count >= 3);
    assert.ok(p.next_review_at, 'retention review scheduled');
    // The review fell due before this pass, so it also earned the one-off review reward.
    assert.equal(nextDay.submit.body.xp.total, 20);
    assert.equal(await xpTotal(u), 35);
  });

  it('refuses a locked check, a paused campaign, and a second submission', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    const locked = await svc.handle(u, { action: 'start_check', campaignId, activityId: HARD_CHECK });
    assert.equal(locked.status, 403);

    const { start } = await takeCheck(svc, u, campaignId, 'a');
    const again = await svc.handle(u, { action: 'submit_check', attemptId: start.attemptId, answers: {} });
    assert.equal(again.status, 409);

    await t.asUser(u, (tx) => tx.query(`update public.campaigns set status = 'paused' where id = $1`, [campaignId]));
    const paused = await svc.handle(u, { action: 'start_check', campaignId, activityId: CHECK });
    assert.equal(paused.status, 409);
  });

  it('completes a lesson once: unlocks its Codex entries and pays lesson XP once', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    const first = await svc.handle(u, { action: 'complete_lesson', campaignId, activityId: LESSON });
    assert.deepEqual(first.body, { completed: true, firstCompletion: true, xp: { total: 10 } });
    const second = await svc.handle(u, { action: 'complete_lesson', campaignId, activityId: LESSON });
    assert.deepEqual(second.body, { completed: true, firstCompletion: false, xp: { total: 0 } });
    const unlocked = await t.asUser(u, (tx) => tx.query<{ concept_id: string }>('select concept_id from public.concept_progress where unlocked_at is not null order by 1'));
    assert.deepEqual(unlocked.rows.map((r) => r.concept_id), [`${TEMPLATE}/core-idea`, `${TEMPLATE}/key-term`]);
    assert.equal(await xpTotal(u), 10);
  });

  it('clears a weakness only after three correct reviews on separate days', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc, advanceHours } = serviceAt(new Date());
    await takeCheck(svc, u, campaignId, 'b');
    const open = () => t.asUser(u, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from public.weakness_records where status = 'open'`)).rows[0]!.n);
    const before = await open();
    assert.ok(before >= 1);
    await takeCheck(svc, u, campaignId, 'a'); // immediately: not due, does not count
    assert.equal(await open(), before);
    // Every concept answered wrongly is reviewed each time here (the fixture has two concepts).
    for (const h of [25, 50, 100]) {
      advanceHours(h);
      await takeCheck(svc, u, campaignId, 'a');
    }
    const rows = await t.asUser(u, (tx) => tx.query<{ status: string; correct_reviews: number }>('select status, correct_reviews from public.weakness_records'));
    assert.ok(rows.rows.length >= 1);
    // A record clears only when each of its three reviews came up in an issued check.
    assert.ok(rows.rows.every((r) => (r.status === 'resolved') === (r.correct_reviews >= 3)));
  });
});

describe('security of learning records', () => {
  it('players cannot write learning records or call the trusted functions', async () => {
    const { u, campaignId } = await newPlayer();
    for (const sql of [
      `insert into public.weakness_records (campaign_id, concept_id, user_id, status, error_category, occurrence_count, last_mistake_at) values ('${campaignId}', '${TEMPLATE}/core-idea', '${u}', 'open', 'misremembered_fact', 1, now())`,
      `insert into public.assessment_attempts (user_id, campaign_id, activity_id, curriculum_version, difficulty, item_ids, issued_items) values ('${u}', '${campaignId}', '${CHECK}', 1, 1, array['x'], '[]')`,
      `insert into public.activity_completions (campaign_id, activity_id, user_id) values ('${campaignId}', '${LESSON}', '${u}')`,
      `update public.competency_progress set mastery_stage = 4`,
      `select public.learning_record_lesson('${u}', '${campaignId}', '${LESSON}', '{}'::jsonb)`,
      `select public.learning_start_context('${u}', '${campaignId}', '${CHECK}')`,
    ]) {
      assert.match((await t.errorAsUser(u, sql)) ?? 'succeeded', /permission denied/, sql);
    }
  });

  it('a player cannot see or submit another player’s check', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const { svc } = serviceAt(new Date());
    const start = await svc.handle(a.u, { action: 'start_check', campaignId: a.campaignId, activityId: CHECK });
    const stolen = await svc.handle(b.u, { action: 'submit_check', attemptId: start.body.attemptId, answers: {} });
    assert.equal(stolen.status, 404);
    const intoOther = await svc.handle(b.u, { action: 'start_check', campaignId: a.campaignId, activityId: CHECK });
    assert.equal(intoOther.status, 404);
    const seen = await t.asUser(b.u, (tx) => tx.query('select id from public.assessment_attempts'));
    assert.equal(seen.rows.length, 0);
  });

  it('the database refuses forged outcomes even from server code', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    const start = await svc.handle(u, { action: 'start_check', campaignId, activityId: CHECK });
    const s = store(t);
    const results = (start.body.items as { key: string }[]).map((i) => ({ itemId: i.key, conceptId: `${TEMPLATE}/core-idea`, correct: true }));
    const forged = (over: object) =>
      s.call('learning_record_submission', {
        p_user_id: u,
        p_attempt_id: start.body.attemptId,
        p_outcome: { submittedAt: new Date().toISOString(), answers: {}, results, correct: 3, total: 3, score: 1, passed: true, competencies: [], weaknesses: [], attributes: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, xp: [], ...over },
      });
    await assert.rejects(forged({ competencies: [{ competencyId: `${TEMPLATE}/foundations`, stage: 4 }] }), /mastery change refused/);
    await assert.rejects(forged({ passed: false, xp: [{ kind: 'knowledge_check_passed', sourceId: CHECK, amount: 15, idempotencyKey: 'k', configVersion: 'v' }] }), /XP not allowed/);
    await assert.rejects(forged({ xp: [{ kind: 'boss_defeated', sourceId: CHECK, amount: 200, idempotencyKey: 'k2', configVersion: 'v' }] }), /XP not allowed/);
    await assert.rejects(forged({ total: 99 }), /do not match/);
  });

  it('a submitted check can never be edited', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    const { start } = await takeCheck(svc, u, campaignId, 'b');
    await assert.rejects(
      t.asRole('service_role', (tx) => tx.query(`update public.assessment_attempts set passed = true where id = $1`, [start.attemptId])),
      /cannot be changed/,
    );
  });

  it('deleting progress removes learning records too', async () => {
    const { u, campaignId } = await newPlayer();
    const { svc } = serviceAt(new Date());
    await takeCheck(svc, u, campaignId, 'b');
    await svc.handle(u, { action: 'complete_lesson', campaignId, activityId: LESSON });
    await t.asUser(u, (tx) => tx.query('select public.delete_my_progress()'));
    for (const table of ['assessment_attempts', 'weakness_records', 'concept_progress', 'activity_completions']) {
      const { rows } = await t.db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [u]);
      assert.equal(rows[0]!.n, 0, table);
    }
  });

  it('rejects malformed requests without touching the database', async () => {
    const { u } = await newPlayer();
    const { svc } = serviceAt(new Date());
    assert.equal((await svc.handle(u, { action: 'give_me_xp' })).status, 400);
    assert.equal((await svc.handle(u, { action: 'start_check', campaignId: 'not-a-uuid', activityId: CHECK })).status, 400);
  });
});
