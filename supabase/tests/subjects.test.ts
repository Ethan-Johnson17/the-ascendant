import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, serviceStore, winBossesAs, type TestDb } from './testDb.ts';
import { createAiService } from '../../src/services/ai/aiService.ts';
import { createDevelopmentFixtures } from '../../src/services/ai/providerFromEnv.ts';
import { defaultAiConfig } from '../../src/services/ai/config.ts';
import type { AiProvider, AiRequest } from '../../src/services/ai/types.ts';
import { createLearningService } from '../../src/services/learning/learningService.ts';

/**
 * "Start a new subject" end to end against the real migrations: the same service the `ai` Edge
 * Function runs, with the labelled fixture (or a scripted AI) and a fake Wikipedia.
 */

let t: TestDb;
before(async () => {
  t = await createTestDb();
});

const ARTICLE = [
  'Beekeeping is the maintenance of bee colonies, commonly in man-made beehives.',
  'Honey bees in the genus Apis are the most commonly kept species, although other honey-producing bees are also kept.',
  '== History ==',
  'Depictions of humans collecting honey from wild bees date to about 10,000 years ago in rock paintings in Spain.',
  'Beekeeping in pottery vessels began about 9,000 years ago in North Africa, according to residue studies.',
  '== Hive products ==',
  'Honey is the complex substance made when bees ingest nectar, process it, and store the substance in honey combs.',
  'Beeswax is secreted by young worker bees from glands on the underside of their abdomens to build the comb.',
  '== References ==',
  'Smith, J. (2001). This line must never reach a lesson.',
].join('\n');

/** A fake MediaWiki API: one article (page 42), found by any title or search. */
function fakeWikipedia(opts: { missing?: boolean } = {}) {
  const calls: string[] = [];
  const fetch = async (input: string) => {
    calls.push(input);
    const u = new URL(input);
    assert.equal(u.hostname, 'en.wikipedia.org');
    const p = u.searchParams;
    const page = { pageid: 42, title: 'Beekeeping', fullurl: 'https://en.wikipedia.org/wiki/Beekeeping' };
    let body: unknown;
    if (p.get('list') === 'search') body = { query: { search: opts.missing ? [] : [{ title: 'Beekeeping' }] } };
    else if (p.get('prop')?.includes('extracts')) body = { query: { pages: [{ ...page, extract: ARTICLE, revisions: [{ revid: 777 }] }] } };
    else body = { query: { pages: [opts.missing ? { title: p.get('titles') ?? '', missing: true } : page] } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

let n = 0;
function serviceWith(provider: AiProvider | null, wiki = fakeWikipedia(), now = () => new Date('2026-11-16T10:00:00Z')) {
  return createAiService(serviceStore(t), provider, {
    now, sleep: async () => {},
    subjects: { fetch: wiki.fetch, timeoutMs: 500, newId: () => `ai-test${String(++n).padStart(6, '0')}` },
  });
}

async function newPlayer() {
  const u = await t.createUser();
  await createCharacterAs(t, u);
  return u;
}

const request = { subject: 'Beekeeping', objective: 'Understand how people keep bees and what hives produce.', startingProficiency: 'none' };
const create = (svc: ReturnType<typeof serviceWith>, u: string, r: object = request) => svc.handle(u, { action: 'create_subject', request: r });
const logRows = (u: string) => t.asUser(u, async (tx) => (await tx.query<Record<string, unknown>>('select role, status from public.ai_requests order by created_at')).rows);

describe('Start a new subject (database + service)', () => {
  it('plans a labelled fixture course, saves it as the player’s own and starts its campaign', async () => {
    const u = await newPlayer();
    const r = await create(serviceWith(createDevelopmentFixtures()), u);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const body = r.body as { templateId: string; campaignId: string; origin: string; title: string };
    assert.equal(body.origin, 'fixture');
    assert.match(body.title, /development fixture/);

    const rows = await t.asUser(u, async (tx) => ({
      templates: (await tx.query('select id, owner_user_id from public.campaign_templates where owner_user_id is not null')).rows,
      campaigns: (await tx.query<{ id: string }>('select id from public.campaigns where template_id = $1', [body.templateId])).rows,
      lessons: (await tx.query('select id from public.learning_activities where template_id = $1', [body.templateId])).rows,
      progress: (await tx.query('select competency_id from public.competency_progress where campaign_id = $1', [body.campaignId])).rows,
      subject: (await tx.query<{ outline: { lessons: { built: boolean }[] } }>('select outline from public.generated_subjects')).rows,
      origin: (await tx.query<{ origin: string }>('select origin from public.curricula where template_id = $1', [body.templateId])).rows,
    }));
    assert.deepEqual(rows.templates, [{ id: body.templateId, owner_user_id: u }]);
    assert.equal(rows.campaigns[0]!.id, body.campaignId);
    assert.equal(rows.lessons.length, 0, 'lessons are built later');
    assert.equal(rows.progress.length, 2, 'Novice progress for each competency');
    assert.deepEqual(rows.subject[0]!.outline.lessons.map((l) => l.built), [false, false, false, false]);
    assert.equal(rows.origin[0]!.origin, 'fixture');
    assert.deepEqual((await logRows(u)).map((x) => x.role), ['course_builder']);

    const other = await newPlayer();
    const seen = await t.asUser(other, async (tx) => (await tx.query('select id from public.campaign_templates where id = $1', [body.templateId])).rows);
    assert.equal(seen.length, 0, 'another player cannot see it');
  });

  it('refuses harmful topics before any AI request', async () => {
    const u = await newPlayer();
    const r = await create(serviceWith(createDevelopmentFixtures()), u, { ...request, subject: 'How to make a pipe bomb', objective: 'Make one at home.' });
    assert.deepEqual([r.status, (r.body as { code: string }).code, (r.body as { aiUsed: boolean }).aiUsed], [422, 'refused_topic', false]);
    assert.equal((await logRows(u)).length, 0);
  });

  it('labels health, law and money courses', async () => {
    const u = await newPlayer();
    const r = await create(serviceWith(createDevelopmentFixtures()), u, { ...request, subject: 'Human nutrition', objective: 'Learn the basics of diet and health.' });
    assert.equal((r.body as { adviceArea: string }).adviceArea, 'health');
  });

  it('allows three open subjects, and a fourth after closing one', async () => {
    const u = await newPlayer();
    const svc = serviceWith(createDevelopmentFixtures());
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await create(svc, u);
      assert.equal(r.status, 200);
      ids.push((r.body as { templateId: string }).templateId);
    }
    const fourth = await create(svc, u);
    assert.deepEqual([fourth.status, (fourth.body as { code: string }).code], [409, 'subject_limit']);
    assert.equal((await logRows(u)).length, 3, 'the refused fourth used no request');

    const closed = await t.asUser(u, async (tx) => (await tx.query<{ ok: boolean }>('select public.close_generated_subject($1) as ok', [ids[0]])).rows[0]!.ok);
    assert.equal(closed, true);
    const status = await t.asUser(u, async (tx) => (await tx.query<{ status: string }>('select status from public.campaigns where template_id = $1', [ids[0]])).rows[0]!.status);
    assert.equal(status, 'paused', 'closing pauses, never deletes');
    assert.equal((await create(svc, u)).status, 200);
  });

  it('refuses a course when no encyclopedia article is found', async () => {
    const u = await newPlayer();
    const r = await create(serviceWith(createDevelopmentFixtures(), fakeWikipedia({ missing: true })), u);
    assert.deepEqual([r.status, (r.body as { code: string }).code], [422, 'no_sources']);
    const subjects = await t.asUser(u, async (tx) => (await tx.query('select 1 from public.generated_subjects')).rows);
    assert.equal(subjects.length, 0);
  });

  it('builds lessons in order from the article, and they work like any lesson', async () => {
    const u = await newPlayer();
    const wiki = fakeWikipedia();
    const svc = serviceWith(createDevelopmentFixtures(), wiki);
    const made = (await create(svc, u)).body as { templateId: string; campaignId: string };
    const build = () => svc.handle(u, { action: 'build_lesson', templateId: made.templateId });

    const first = await build();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const lessonId = (first.body as { activityId: string }).activityId;
    const content = await t.asUser(u, async (tx) => ({
      activities: (await tx.query<{ kind: string; target_stage: number | null; written_count: number }>('select kind, target_stage, written_count from public.learning_activities where template_id = $1 order by position', [made.templateId])).rows,
      sections: (await tx.query<{ sections: { citations: { locator: string }[] }[] }>('select sections from public.learning_activities where id = $1', [lessonId])).rows[0]!.sections,
      codex: (await tx.query('select id from public.codex_entries where template_id = $1', [made.templateId])).rows,
    }));
    assert.deepEqual(content.activities, [{ kind: 'lesson', target_stage: null, written_count: 0 }, { kind: 'assessment', target_stage: 2, written_count: 1 }]);
    assert.ok(content.sections.every((s) => s.citations[0]!.locator.startsWith('“')), 'each section shows its quote');
    assert.ok(content.codex.length >= 1);
    assert.doesNotMatch(JSON.stringify(content.sections), /never reach a lesson/, 'reference sections are not used');

    const early = await build();
    assert.deepEqual([early.status, (early.body as { code: string }).code], [409, 'finish_previous']);

    // The player reads the lesson through the normal learning service; then lesson 2 can be built.
    const learning = createLearningService(serviceStore(t));
    const done = await learning.handle(u, { action: 'complete_lesson', campaignId: made.campaignId, activityId: lessonId });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await build()).status, 200);
    assert.deepEqual((await logRows(u)).map((x) => x.role), Array(5).fill('course_builder'), '1 outline + 2 per lesson');
  });

  it('never saves a lesson whose quotes are not in the source', async () => {
    const u = await newPlayer();
    const fixtures = createDevelopmentFixtures();
    const svc0 = serviceWith(fixtures);
    const made = (await create(svc0, u)).body as { templateId: string };
    // An AI that writes a fluent lesson with made-up quotes.
    const inventing: AiProvider = {
      id: 'scripted', model: 'm', origin: 'ai',
      generate: async (req: AiRequest) => {
        const invented = { estimatedMinutes: 5, sections: [0, 1, 2].map((i) => ({ heading: `Part ${i}`, paragraphs: ['Bees were first kept on the Moon in 1802 by astronauts, who carried hives in their rockets.', 'This invented paragraph exists only to test that made-up quotes are caught.'], quote: 'Bees were first kept on the Moon in 1802.', certainty: 'established' })),
          concepts: [1, 2].map((i) => ({ title: `Moon bees ${i}`, summary: 'An invented idea for testing.', explanation: ['Invented for the test only, not true.'], quote: 'astronauts kept bees on the Moon', certainty: 'established' })) };
        assert.equal(req.role, 'course_builder');
        return { text: JSON.stringify(invented), usage: { inputTokens: 1, outputTokens: 1 }, model: 'm', provider: 'scripted', origin: 'ai' };
      },
    };
    const r = await serviceWith(inventing).handle(u, { action: 'build_lesson', templateId: made.templateId });
    assert.deepEqual([r.status, (r.body as { code: string }).code], [422, 'unsupported']);
    const saved = await t.asUser(u, async (tx) => (await tx.query('select 1 from public.learning_activities where template_id = $1', [made.templateId])).rows);
    assert.equal(saved.length, 0);
  });

  it('players cannot write course content or call the Course Builder functions', async () => {
    const u = await newPlayer();
    const made = (await create(serviceWith(createDevelopmentFixtures()), u)).body as { templateId: string };
    assert.ok(await t.errorAsUser(u, `insert into public.generated_subjects (template_id, user_id, campaign_id, description, advice_area, request, outline) values ('x', $1, gen_random_uuid(), 'd', 'none', '{}', '{"lessons":[]}')`, [u]));
    assert.ok(await t.errorAsUser(u, `update public.generated_subjects set closed_at = null`));
    assert.ok(await t.errorAsUser(u, `insert into public.learning_activities (id, template_id, objective_id, key, kind, title, position, competency_ids, estimated_minutes, sections) values ('${made.templateId}/x', '${made.templateId}', '${made.templateId}/main', 'x', 'lesson', 'x', 9, '{a}', 5, '[]')`));
    assert.ok(await t.errorAsUser(u, `select public.ai_create_subject($1, 3, '{}'::jsonb)`, [u]));
    assert.ok(await t.errorAsUser(u, `select public.ai_save_lesson($1, $2, 'x', null, '{}'::jsonb)`, [u, made.templateId]));
    assert.ok(await t.errorAsUser(u, `select public.ai_course_context($1, $2)`, [u, made.templateId]));
    const other = await newPlayer();
    const closed = await t.asUser(other, async (tx) => (await tx.query<{ ok: boolean }>('select public.close_generated_subject($1) as ok', [made.templateId])).rows[0]!.ok);
    assert.equal(closed, false, 'another player cannot close it');
  });

  it('lets a player report a lesson once, and only in their own campaigns', async () => {
    const u = await newPlayer();
    const svc = serviceWith(createDevelopmentFixtures());
    const made = (await create(svc, u)).body as { templateId: string };
    const lessonId = ((await svc.handle(u, { action: 'build_lesson', templateId: made.templateId })).body as { activityId: string }).activityId;
    const report = (who: string) => t.errorAsUser(who, `insert into public.content_reports (activity_id, message) values ($1, 'The date in section 2 looks wrong.')`, [lessonId]);
    assert.equal(await report(u), null);
    assert.ok(await report(u), 'only once');
    assert.ok(await report(await newPlayer()), 'not in someone else’s course');
    assert.ok(await t.errorAsUser(u, `update public.content_reports set message = 'changed'`));
  });
});

describe('Go deeper (database + service)', () => {
  const setStage = (campaignId: string, stage: number) =>
    t.db.query('update public.competency_progress set mastery_stage = $2 where campaign_id = $1', [campaignId, stage]);
  const checks = (u: string, templateId: string) =>
    t.asUser(u, async (tx) => (await tx.query<{ key: string; target_stage: number; question_count: number; written_count: number; kinds: string[] }>(
      `select a.key, a.target_stage, a.question_count, a.written_count, array_agg(i.kind order by i.position) as kinds
         from public.learning_activities a join public.assessment_items i on i.activity_id = a.id
        where a.template_id = $1 and a.kind = 'assessment' group by a.id order by a.target_stage`, [templateId])).rows);

  it('adds Competent, Proficient and Advanced checks one at a time, only when the skill is ready', async () => {
    const u = await newPlayer();
    let minutes = 0; // five minutes pass between requests, so the per-minute limit stays out of the way
    const svc = serviceWith(createDevelopmentFixtures(), fakeWikipedia(), () => new Date(Date.parse('2026-11-16T10:00:00Z') + (minutes += 5) * 60_000));
    const made = (await create(svc, u)).body as { templateId: string; campaignId: string };
    assert.equal((await svc.handle(u, { action: 'build_lesson', templateId: made.templateId })).status, 200);
    const lessonKey = (await t.asUser(u, async (tx) => (await tx.query<{ key: string }>(
      `select key from public.learning_activities where template_id = $1 and kind = 'lesson'`, [made.templateId])).rows[0]!.key));
    const deepen = (key = lessonKey) => svc.handle(u, { action: 'deepen_lesson', templateId: made.templateId, lessonKey: key });
    const requests = async () => (await logRows(u)).length;

    // Still Novice: the Competent check waits, and no AI request is spent.
    const before = await requests();
    const waiting = await deepen();
    assert.deepEqual([waiting.status, (waiting.body as { code: string }).code], [409, 'not_ready']);
    assert.equal(await requests(), before);

    await setStage(made.campaignId, 2);
    const competent = await deepen();
    assert.equal(competent.status, 200, JSON.stringify(competent.body));
    assert.deepEqual([(competent.body as { stage: number }).stage, (competent.body as { origin: string }).origin], [3, 'fixture']);
    assert.equal(await requests(), before + 1, 'one request per deeper check');
    assert.equal((await deepen()).status, 409, 'Proficient waits for Competent');

    await setStage(made.campaignId, 3);
    assert.equal((await deepen()).status, 200);
    await setStage(made.campaignId, 4);
    const advanced = await deepen();
    assert.equal(advanced.status, 200, JSON.stringify(advanced.body));

    const rows = await checks(u, made.templateId);
    assert.deepEqual(rows.map((r) => r.target_stage), [2, 3, 4, 5]);
    assert.deepEqual(rows.map((r) => r.key), [`${lessonKey}-check`, `${lessonKey}-check-3`, `${lessonKey}-check-4`, `${lessonKey}-check-5`]);
    assert.ok(rows.slice(1, 3).every((r) => r.question_count === 3 && r.written_count === 1 && r.kinds.at(-1) === 'written'));
    assert.deepEqual([rows[3]!.question_count, rows[3]!.written_count, rows[3]!.kinds], [2, 2, ['written', 'written']], 'Advanced is written answers only');

    await setStage(made.campaignId, 5);
    assert.deepEqual((await deepen()).body, { error: 'This lesson already has every check up to Advanced.', code: 'complete' });
    assert.equal((await deepen('l9-missing')).status, 404);
  });

  it('a deeper check plays like any check, behind the same boss gate', async () => {
    const u = await newPlayer();
    const svc = serviceWith(createDevelopmentFixtures());
    const made = (await create(svc, u)).body as { templateId: string; campaignId: string };
    const lessonId = ((await svc.handle(u, { action: 'build_lesson', templateId: made.templateId })).body as { activityId: string }).activityId;
    await setStage(made.campaignId, 2);
    const deeper = (await svc.handle(u, { action: 'deepen_lesson', templateId: made.templateId, lessonKey: lessonId.split('/')[1]! })).body as { activityId: string };

    const learning = createLearningService(serviceStore(t));
    const locked = await learning.handle(u, { action: 'start_check', campaignId: made.campaignId, activityId: deeper.activityId });
    assert.notEqual(locked.status, 200, 'the Apprentice boss comes first');
    await winBossesAs(t, u, made.campaignId, [2]);
    const start = await learning.handle(u, { action: 'start_check', campaignId: made.campaignId, activityId: deeper.activityId });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.doesNotMatch(JSON.stringify(start.body), /"answer"|modelAnswer|criteria/, 'no answers reach the player');
  });

  it('the database refuses skipped stages, other lessons’ rows and players calling it', async () => {
    const u = await newPlayer();
    const svc = serviceWith(createDevelopmentFixtures());
    const made = (await create(svc, u)).body as { templateId: string; campaignId: string };
    const lessonKey = ((await svc.handle(u, { action: 'build_lesson', templateId: made.templateId })).body as { activityId: string }).activityId.split('/')[1]!;
    await setStage(made.campaignId, 4);
    const save = (stage: number, rows: object) => t.asRole('service_role', (tx) =>
      tx.query('select public.ai_save_deeper_check($1, $2, $3, $4::smallint, $5::jsonb)', [u, made.templateId, lessonKey, stage, JSON.stringify(rows)])).then(() => null, (e: Error) => e.message);
    assert.match((await save(4, { activity: {}, items: [] }))!, /out of order/, 'Proficient cannot come before Competent');
    const id = `${made.templateId}/${lessonKey}-check-3`;
    const activity = { id, key: `${lessonKey}-check-3`, template_id: made.templateId, objective_id: `${made.templateId}/${lessonKey}-goal`, kind: 'assessment', target_stage: 3, competency_ids: ['someone-else/skill'] };
    assert.match((await save(3, { activity, items: [{}, {}] }))!, /another lesson/);
    assert.ok(await t.errorAsUser(u, `select public.ai_deepen_context($1, $2, $3)`, [u, made.templateId, lessonKey]));
    assert.ok(await t.errorAsUser(u, `select public.ai_save_deeper_check($1, $2, $3, 3::smallint, '{}'::jsonb)`, [u, made.templateId, lessonKey]));
  });
});

describe('Practical project for an AI-made course (database + service)', () => {
  it('is written once, only when every lesson is built and every skill is Proficient', async () => {
    const u = await newPlayer();
    let minutes = 0;
    const svc = serviceWith(createDevelopmentFixtures(), fakeWikipedia(), () => new Date(Date.parse('2026-11-16T10:00:00Z') + (minutes += 5) * 60_000));
    const made = (await create(svc, u)).body as { templateId: string; campaignId: string };
    const write = () => svc.handle(u, { action: 'write_project', templateId: made.templateId });
    const learning = createLearningService(serviceStore(t));

    assert.deepEqual((await write()).body, { error: 'Build every lesson in this course first.', code: 'not_ready' });
    for (let i = 0; i < 4; i++) {
      const built = await svc.handle(u, { action: 'build_lesson', templateId: made.templateId });
      assert.equal(built.status, 200, JSON.stringify(built.body));
      await learning.handle(u, { action: 'complete_lesson', campaignId: made.campaignId, activityId: (built.body as { activityId: string }).activityId });
    }
    const before = (await logRows(u)).length;
    const waiting = await write();
    assert.deepEqual([waiting.status, (waiting.body as { code: string }).code], [409, 'not_ready']);
    assert.match((waiting.body as { error: string }).error, /to Proficient first/);
    assert.equal((await logRows(u)).length, before, 'no AI request while waiting');

    await t.db.query('update public.competency_progress set mastery_stage = 4 where campaign_id = $1', [made.campaignId]);
    const written = await write();
    assert.equal(written.status, 200, JSON.stringify(written.body));
    assert.equal((written.body as { origin: string }).origin, 'fixture');
    assert.equal((await logRows(u)).length, before + 1, '1 request');
    assert.deepEqual([(await write()).status, ((await write()).body as { code: string }).code], [409, 'complete']);

    const project = await t.asUser(u, async (tx) => (await tx.query<{ id: string; is_project: boolean; target_stage: number; competency_ids: string[]; objective_id: string }>(
      `select id, is_project, target_stage, competency_ids, objective_id from public.learning_activities where template_id = $1 and is_project`, [made.templateId])).rows);
    assert.equal(project.length, 1);
    assert.deepEqual([project[0]!.target_stage, project[0]!.objective_id], [5, `${made.templateId}/project-goal`]);
    const taught = await t.asUser(u, async (tx) => (await tx.query<{ c: string }>(
      `select distinct unnest(competency_ids) as c from public.learning_activities where template_id = $1 and kind = 'lesson' order by 1`, [made.templateId])).rows.map((r) => r.c));
    assert.deepEqual([...project[0]!.competency_ids].sort(), [...taught].sort(), 'covers every skill the lessons teach');

    await winBossesAs(t, u, made.campaignId);
    const start = await learning.handle(u, { action: 'start_check', campaignId: made.campaignId, activityId: project[0]!.id });
    // No Examiner in this learning service, so an all-written project waits for it, as designed.
    assert.deepEqual([start.status, (start.body as { code?: string }).code], [503, 'examiner_unavailable']);
    assert.ok(await t.errorAsUser(u, `select public.ai_save_project($1, $2, '{}'::jsonb)`, [u, made.templateId]));
    assert.ok(await t.errorAsUser(u, `select public.ai_project_context($1, $2)`, [u, made.templateId]));
  });
});
