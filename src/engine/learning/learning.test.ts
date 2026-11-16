import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, defaultLearningConfig, HOUR_MS } from './config.ts';
import { validateCurriculum, type AssessmentItem, type Curriculum } from './curriculum.ts';
import { gradeAttempt, gradeItem, publicItem, type WrittenMark } from './grading.ts';
import { countSpacedPasses, decideMastery } from './mastery.ts';
import { applyRetentionResult, freshRetention, retentionStatus } from './retention.ts';
import { applyAnswerToWeakness, reviewPriority, type WeaknessState } from './weakness.ts';
import { recommendDifficulty, selectItems } from './difficulty.ts';
import { planAttempt, resolveSubmission, type CompetencyContext, type SubmitContext } from './session.ts';
import { planNextSteps, type PlanInput } from './nextSteps.ts';
import { fixtureCurriculum, fixtureCurriculumGenerator } from '../../fixtures/fixtureCurriculumGenerator.ts';
import { generateCurriculum } from '../../services/curriculum/generator.ts';

const T0 = new Date('2026-11-14T09:00:00Z');
const hours = (h: number) => new Date(T0.getTime() + h * HOUR_MS);

function fixture(): Curriculum {
  const v = validateCurriculum(fixtureCurriculum({ subject: 'Astronomy' }, 'astronomy'));
  assert.ok(v.ok, v.ok ? '' : v.issues.join('\n'));
  return v.curriculum;
}

const choice: AssessmentItem = {
  key: 'q', concept: 'c', difficulty: 1, kind: 'single_choice', prompt: 'p', explanation: 'e', errorCategory: 'misremembered_fact', citations: [],
  options: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B', errorCategory: 'related_concept_confusion' }, { key: 'c', text: 'C' }],
  answer: 'a',
};
const order: AssessmentItem = {
  key: 'o', concept: 'c', difficulty: 2, kind: 'ordering', prompt: 'p', explanation: 'e', errorCategory: 'misremembered_fact', citations: [],
  entries: [{ key: 'z', text: 'Z' }, { key: 'x', text: 'X' }, { key: 'y', text: 'Y' }],
  answer: ['x', 'y', 'z'],
};
const match: AssessmentItem = {
  key: 'm', concept: 'c', difficulty: 3, kind: 'matching', prompt: 'p', explanation: 'e', errorCategory: 'conceptual_misunderstanding', citations: [],
  left: [{ key: 'l1', text: '1' }, { key: 'l2', text: '2' }], right: [{ key: 'r1', text: 'one' }, { key: 'r2', text: 'two' }],
  answer: { l1: 'r1', l2: 'r2' },
};

describe('curriculum validation', () => {
  it('accepts the fixture curriculum for any subject name', () => {
    for (const subject of ['Astronomy', 'Digital marketing', 'Anatomy & physiology']) {
      const v = validateCurriculum(fixtureCurriculum({ subject }, 'test'));
      assert.ok(v.ok, v.ok ? '' : v.issues.join('\n'));
    }
  });

  it('rejects broken shapes and broken references with readable reasons', () => {
    const base = fixtureCurriculum({ subject: 'Astronomy' }, 'astronomy');
    assert.ok(!validateCurriculum({ ...base, disciplines: [] }).ok);
    const broken = structuredClone(base) as any;
    const check = broken.disciplines[0].topics[0].objectives[0].activities[1];
    check.items[0].answer = 'nope';
    check.items[1].concept = 'missing-entry';
    check.questionCount = 20;
    broken.disciplines[0].topics[0].objectives[0].activities[0].sections[0].citations = [{ source: 'made-up' }];
    broken.competencies[1].prerequisites = ['ghost'];
    const v = validateCurriculum(broken);
    assert.ok(!v.ok);
    const all = v.issues.join('\n');
    for (const fragment of ['answer "nope"', 'unknown Codex entry "missing-entry"', 'has only 6', 'unknown source "made-up"', 'unknown competency "ghost"']) {
      assert.ok(all.includes(fragment), `expected issue mentioning ${fragment}\n${all}`);
    }
  });

  it('rejects an ordering question that already shows the answer, and a non-https source', () => {
    const base = structuredClone(fixtureCurriculum({ subject: 'X' }, 'x')) as any;
    base.disciplines[0].topics[0].objectives[0].activities[1].items[0] = { ...order, key: 'q1', concept: 'core-idea', entries: [{ key: 'x', text: 'X' }, { key: 'y', text: 'Y' }, { key: 'z', text: 'Z' }] };
    const v = validateCurriculum(base);
    assert.ok(!v.ok && v.issues.some((i) => i.includes('already in the correct order')));
    base.sources[0].url = 'http://example.org';
    assert.ok(!validateCurriculum(base).ok);
  });

  it('requires the curriculum’s competencies to match its campaign template', () => {
    const v = validateCurriculum(fixtureCurriculum({ subject: 'X' }, 'x'), ['foundations']);
    assert.ok(!v.ok && v.issues[0]!.includes('must match the campaign template'));
  });

  it('generates through the generator interface and validates the result', async () => {
    const ok = await generateCurriculum(fixtureCurriculumGenerator, { subject: 'Economics', objective: 'Understand supply and demand', startingProficiency: 'none', minutesPerWeek: 60, depth: 'survey' }, 'economics');
    assert.ok(ok.ok && ok.validation.curriculum.origin === 'fixture');
    const bad = await generateCurriculum(fixtureCurriculumGenerator, { subject: '' }, 'economics');
    assert.ok(!bad.ok);
    const lying = await generateCurriculum({ id: 'liar', propose: async () => ({ nonsense: true }) }, { subject: 'Law', objective: 'Learn contract law', startingProficiency: 'none', minutesPerWeek: 60, depth: 'survey' }, 'law');
    assert.ok(!lying.ok && lying.issues.length > 0);
  });
});

describe('grading', () => {
  it('marks each question type and records an error category for mistakes', () => {
    assert.equal(gradeItem(choice, 'a').correct, true);
    assert.equal(gradeItem(choice, 'b').errorCategory, 'related_concept_confusion');
    assert.equal(gradeItem(choice, 'c').errorCategory, 'misremembered_fact');
    assert.equal(gradeItem(order, ['x', 'y', 'z']).correct, true);
    assert.equal(gradeItem(order, ['x', 'z', 'y']).correct, false);
    assert.equal(gradeItem(match, { l1: 'r1', l2: 'r2' }).correct, true);
    assert.equal(gradeItem(match, { l1: 'r2', l2: 'r1' }).errorCategory, 'conceptual_misunderstanding');
  });

  it('treats missing or wrongly shaped answers as wrong, never as errors', () => {
    assert.equal(gradeItem(choice, undefined).correct, false);
    assert.equal(gradeItem(choice, ['a']).correct, false);
    assert.equal(gradeItem(order, 'x').correct, false);
    assert.equal(gradeItem(match, ['r1']).correct, false);
  });

  it('passes at 80% by default', () => {
    const items = [choice, { ...choice, key: 'q2' }, { ...choice, key: 'q3' }, { ...choice, key: 'q4' }, { ...choice, key: 'q5' }];
    assert.equal(gradeAttempt(items, { q: 'a', q2: 'a', q3: 'a', q4: 'a', q5: 'b' }, 0.8).passed, true);
    assert.equal(gradeAttempt(items, { q: 'a', q2: 'a', q3: 'a', q4: 'b', q5: 'b' }, 0.8).passed, false);
  });

  it('never shows the answer key before marking', () => {
    for (const item of [choice, order, match]) {
      const shown = JSON.stringify(publicItem(item));
      assert.ok(!shown.includes('"answer"') && !shown.includes('errorCategory') && !shown.includes('explanation'), shown);
    }
  });
});

describe('mastery requires evidence on separate days', () => {
  it('counts passes only when at least 20 hours apart', () => {
    assert.equal(countSpacedPasses([hours(0), hours(1), hours(19)]), 1);
    assert.equal(countSpacedPasses([hours(0), hours(20)]), 2);
    assert.equal(countSpacedPasses([hours(23), hours(0), hours(10)]), 2);
  });

  it('advances one stage after two spaced passes, not after two same-day passes', () => {
    assert.equal(decideMastery(1, [hours(0), hours(2)]).advanced, false);
    const d = decideMastery(1, [hours(0), hours(24)]);
    assert.equal(d.stage, 2);
    assert.equal(decideMastery(2, [hours(0), hours(24), hours(48), hours(72)]).stage, 3);
  });

  it('caps self-marked checks at Proficient', () => {
    assert.equal(decideMastery(4, [hours(0), hours(30), hours(60)]).stage, 4);
  });
});

describe('retention scheduling', () => {
  it('starts on the first pass and climbs only on due reviews', () => {
    let r = applyRetentionResult(freshRetention, true, T0);
    assert.equal(r.state.step, 0);
    assert.deepEqual(r.state.nextReviewAt, addDays(T0, 1));
    // Cramming before the review is due changes nothing.
    r = applyRetentionResult(r.state, true, hours(2));
    assert.equal(r.state.step, 0);
    assert.equal(r.wasDueReview, false);
    r = applyRetentionResult(r.state, true, hours(25));
    assert.equal(r.wasDueReview, true);
    assert.equal(r.state.step, 1);
    assert.deepEqual(r.state.nextReviewAt, addDays(hours(25), 3));
  });

  it('a failed due review steps back and flags it, without any effect on mastery', () => {
    const state = { step: 3, nextReviewAt: T0, needsReview: false, lastDemonstratedAt: T0 };
    const r = applyRetentionResult(state, false, hours(1));
    assert.equal(r.state.step, 1);
    assert.equal(r.state.needsReview, true);
    assert.equal(retentionStatus(r.state, hours(2)), 'needs_review');
    assert.ok(!('stage' in r.state));
  });

  it('a failure before ever passing does not start the schedule', () => {
    assert.equal(applyRetentionResult(freshRetention, false, T0).state.step, null);
  });
});

describe('Weakness Bank', () => {
  const wrong = { concept: 'c', correct: false, errorCategory: 'misremembered_fact' as const, given: 'b' };
  const right = { concept: 'c', correct: true, given: 'a' };

  it('opens a record on a mistake, due a day later', () => {
    const u = applyAnswerToWeakness(null, wrong, T0);
    assert.equal(u.event, 'opened');
    assert.deepEqual(u.state!.nextReviewAt, addDays(T0, 1));
  });

  it('is not cleared by one correct answer, nor by answers before the review is due', () => {
    let s = applyAnswerToWeakness(null, wrong, T0).state!;
    const early = applyAnswerToWeakness(s, right, hours(2));
    assert.equal(early.event, 'not_due');
    s = applyAnswerToWeakness(s, right, hours(24)).state!;
    assert.equal(s.status, 'open');
    assert.equal(s.correctReviews, 1);
  });

  it('resolves after three correct due reviews (~1, 3 and 7 days) and keeps the record', () => {
    let s: WeaknessState = applyAnswerToWeakness(null, wrong, T0).state!;
    for (const day of [1, 3, 7]) s = applyAnswerToWeakness(s, right, addDays(T0, day)).state!;
    assert.equal(s.status, 'resolved');
    assert.equal(s.occurrenceCount, 1);
    assert.equal(reviewPriority(s, addDays(T0, 30)), 0);
  });

  it('restarts the count on another mistake and reopens resolved records', () => {
    let s = applyAnswerToWeakness(null, wrong, T0).state!;
    s = applyAnswerToWeakness(s, right, addDays(T0, 1)).state!;
    const again = applyAnswerToWeakness(s, wrong, addDays(T0, 2));
    assert.equal(again.event, 'mistake_repeated');
    assert.equal(again.state!.correctReviews, 0);
    assert.equal(again.state!.occurrenceCount, 2);
    const resolved = { ...again.state!, status: 'resolved' as const };
    assert.equal(applyAnswerToWeakness(resolved, wrong, addDays(T0, 9)).event, 'reopened');
  });

  it('ranks frequent, overdue weaknesses first', () => {
    const a = applyAnswerToWeakness(null, wrong, T0).state!;
    const b = { ...a, occurrenceCount: 3 };
    assert.ok(reviewPriority(b, addDays(T0, 2)) > reviewPriority(a, addDays(T0, 2)));
    assert.ok(reviewPriority(a, addDays(T0, 5)) > reviewPriority(a, hours(1)));
  });
});

describe('adaptive difficulty', () => {
  const base = { recentResults: [] as boolean[], openWeaknesses: 0, preference: 0 as const, lastDifficulty: null };
  it('starts at standard, raises on strong accuracy and lowers on weak accuracy', () => {
    assert.equal(recommendDifficulty(base), 2);
    assert.equal(recommendDifficulty({ ...base, recentResults: Array(10).fill(true) }), 3);
    assert.equal(recommendDifficulty({ ...base, recentResults: [true, false, false, false, true] }), 1);
    assert.equal(recommendDifficulty({ ...base, recentResults: [true, true] }), 2, 'too few answers to judge');
  });
  it('holds at standard with many open weaknesses, and honours the player’s preference', () => {
    assert.equal(recommendDifficulty({ ...base, lastDifficulty: 3, openWeaknesses: 3 }), 2);
    assert.equal(recommendDifficulty({ ...base, preference: 1 }), 3);
    assert.equal(recommendDifficulty({ ...base, preference: -1, lastDifficulty: 1 }), 1);
  });
  it('selects questions nearest the target difficulty, deterministically', () => {
    const items = fixture().disciplines[0]!.topics[0]!.objectives[0]!.activities.flatMap((a) => (a.kind === 'assessment' ? a.items : []));
    const picked = selectItems(items, 3, 1, 'seed');
    assert.ok(picked.every((i) => i.difficulty === 1 || i.difficulty === 2));
    assert.deepEqual(selectItems(items, 3, 1, 'seed').map((i) => i.key), picked.map((i) => i.key));
    assert.equal(new Set(picked.map((i) => i.key)).size, 3);
  });
});

describe('a whole check, decided by the engine', () => {
  const comp = (over: Partial<CompetencyContext> = {}): CompetencyContext => ({
    competencyId: 'astronomy/foundations', stage: 1, retention: freshRetention, passTimesForNext: [], recentResults: [], openWeaknesses: 0, lastDifficulty: null, ...over,
  });
  const items = [choice, { ...choice, key: 'q2', concept: 'd' }];
  const ctx = (over: Partial<SubmitContext> = {}): SubmitContext => ({
    campaignId: 'camp-1',
    attempt: { id: 'att-1', submitted: false, difficulty: 2 },
    activity: { id: 'astronomy/intro-check', targetStage: 2 },
    items,
    competencies: [comp()],
    weaknesses: [],
    standings: [{ competencyId: 'astronomy/foundations', attribute: 'int', stage: 1 }],
    ...over,
  });

  it('refuses locked checks and paused campaigns', () => {
    const start = { campaignStatus: 'active' as const, activity: { id: 'x', targetStage: 3, questionCount: 1, writtenCount: 0 }, items, competencies: [comp()], preference: 0 as const, weakConcepts: new Set<string>(), writtenAvailable: false };
    assert.deepEqual((planAttempt(start, 's') as { code: string }).code, 'locked');
    assert.deepEqual((planAttempt({ ...start, campaignStatus: 'paused' }, 's') as { code: string }).code, 'campaign_inactive');
    const ok = planAttempt({ ...start, activity: { ...start.activity, targetStage: 2 } }, 's');
    assert.ok(ok.ok && ok.items.length === 1);
  });

  it('a first pass earns check XP and starts retention, but does not advance mastery alone', () => {
    const r = resolveSubmission(ctx(), { q: 'a', q2: 'a' }, T0);
    assert.ok(r.ok);
    assert.equal(r.grade.passed, true);
    assert.equal(r.competencies[0]!.mastery.stage, 1);
    assert.equal(r.competencies[0]!.retention.step, 0);
    assert.deepEqual(r.xp.map((x) => x.idempotencyKey), ['knowledge_check_passed:astronomy/intro-check']);
  });

  it('a second pass on another day advances the stage and re-derives attributes', () => {
    const standings = [
      { competencyId: 'astronomy/foundations', attribute: 'int' as const, stage: 1 as const },
      { competencyId: 'history/geography', attribute: 'int' as const, stage: 3 as const },
    ];
    const r = resolveSubmission(ctx({ competencies: [comp({ passTimesForNext: [T0] })], standings }), { q: 'a', q2: 'a' }, hours(26));
    assert.ok(r.ok);
    assert.equal(r.competencies[0]!.mastery.stage, 2);
    // Apprentice (1) + Competent (2) = 3 points → Intelligence 2.
    assert.equal(r.attributes.int, 2);
  });

  it('a failed check records weaknesses, pays no XP and never lowers mastery', () => {
    const r = resolveSubmission(ctx({ competencies: [comp({ stage: 3 })] }), { q: 'b', q2: 'c' }, T0);
    assert.ok(r.ok);
    assert.equal(r.grade.passed, false);
    assert.equal(r.competencies[0]!.mastery.stage, 3);
    assert.deepEqual(r.xp, []);
    assert.deepEqual(r.weaknesses.map((w) => [w.state.concept, w.event, w.state.errorCategory]), [
      ['c', 'opened', 'related_concept_confusion'],
      ['d', 'opened', 'misremembered_fact'],
    ]);
  });

  it('a pass while a review is due earns that review’s XP once, keyed to the review', () => {
    const retention = { step: 0, nextReviewAt: hours(24), needsReview: false, lastDemonstratedAt: T0 };
    const r = resolveSubmission(ctx({ competencies: [comp({ stage: 2, retention })] }), { q: 'a', q2: 'a' }, hours(30));
    assert.ok(r.ok);
    const keys = r.xp.map((x) => x.idempotencyKey);
    assert.ok(keys.includes(`retention_review_passed:astronomy/foundations@${hours(24).toISOString()}`));
    const early = resolveSubmission(ctx({ competencies: [comp({ stage: 2, retention })] }), { q: 'a', q2: 'a' }, hours(5));
    assert.ok(early.ok && !early.xp.some((x) => x.kind === 'retention_review_passed'));
  });

  it('refuses a second submission of the same attempt', () => {
    const r = resolveSubmission(ctx({ attempt: { id: 'a', submitted: true, difficulty: 2 } }), { q: 'a' }, T0);
    assert.ok(!r.ok && r.code === 'already_submitted');
  });

  it('uses only configured numbers', () => {
    assert.equal(defaultLearningConfig.mastery.passMark, 0.8);
    assert.equal(defaultLearningConfig.weakness.reviewGapsDays.length, 3);
  });
});

describe('written answers (Phase 4 B)', () => {
  const written: AssessmentItem = {
    key: 'w', concept: 'c', difficulty: 2, kind: 'written', prompt: 'Why did farming need irrigation?', explanation: 'e', errorCategory: 'incomplete_explanation', citations: [],
    criteria: [
      { key: 'rain', description: 'Says rainfall was too low for crops', points: 2 },
      { key: 'canals', description: 'Mentions canals from the rivers', points: 1 },
    ],
    passPoints: 2, modelAnswer: 'Rain was too scarce, so farmers dug canals.', maxChars: 1200,
  };
  const sure = (met: string[]): WrittenMark => ({ criteriaMet: met, confident: true });
  const comp = (over: Partial<CompetencyContext> = {}): CompetencyContext => ({
    competencyId: 'astronomy/foundations', stage: 4, retention: freshRetention, passTimesForNext: [], recentResults: [], openWeaknesses: 0, lastDifficulty: null, ...over,
  });
  const ctx = (over: Partial<SubmitContext> = {}): SubmitContext => ({
    campaignId: 'camp-1', attempt: { id: 'att-1', submitted: false, difficulty: 2 }, activity: { id: 'adv-check', targetStage: 5 },
    items: [written, { ...written, key: 'w2' }], competencies: [comp()], weaknesses: [],
    standings: [{ competencyId: 'astronomy/foundations', attribute: 'int', stage: 4 }], ...over,
  });

  it('the engine adds up rubric points; the Examiner only says which criteria are met', () => {
    assert.ok(gradeItem(written, 'answer', sure(['rain'])).correct);
    assert.ok(!gradeItem(written, 'answer', sure(['canals'])).correct);
    assert.deepEqual(gradeItem(written, 'answer', sure(['rain', 'canals', 'invented'])).points, { earned: 3, required: 2, total: 3 });
    assert.throws(() => gradeItem(written, 'answer'));
  });

  it('a blank or over-long answer is simply wrong and needs no Examiner', () => {
    assert.ok(!gradeItem(written, '   ').correct);
    assert.ok(!gradeItem(written, 'x'.repeat(1201), sure(['rain'])).correct);
  });

  it('never shows the rubric or model answer before marking', () => {
    const shown = JSON.stringify(publicItem(written));
    assert.ok(!shown.includes('canals') && !shown.includes('scarce') && !shown.includes('passPoints'));
  });

  it('an unsure mark makes the whole attempt not count: no pass, XP, retention or weakness change', () => {
    const r = resolveSubmission(ctx(), { w: 'long answer', w2: 'another answer' }, T0, defaultLearningConfig, { w: sure(['rain', 'canals']), w2: { criteriaMet: ['rain'], confident: false } });
    assert.ok(r.ok && !r.counted && !r.grade.passed);
    assert.deepEqual(r.xp, []);
    assert.deepEqual(r.weaknesses, []);
    assert.equal(r.competencies[0]!.retention, freshRetention);
    assert.equal(r.competencies[0]!.mastery.stage, 4);
  });

  it('refuses to mark when a written answer has no Examiner mark yet', () => {
    const r = resolveSubmission(ctx(), { w: 'long answer', w2: 'another' }, T0, defaultLearningConfig, { w: sure(['rain']) });
    assert.ok(!r.ok && r.code === 'examiner_unavailable');
  });

  it('confident written passes on two days can reach Advanced; self-marked checks cannot', () => {
    const marks = { w: sure(['rain', 'canals']), w2: sure(['rain']) };
    const r = resolveSubmission(ctx({ competencies: [comp({ passTimesForNext: [hours(-30)] })] }), { w: 'a', w2: 'b' }, T0, defaultLearningConfig, marks);
    assert.ok(r.ok && r.counted && r.grade.passed && r.competencies[0]!.mastery.stage === 5);
    const selfMarked = resolveSubmission(
      ctx({ items: [choice], competencies: [comp({ passTimesForNext: [hours(-30)] })] }), { q: 'a' }, T0,
    );
    assert.ok(selfMarked.ok && selfMarked.competencies[0]!.mastery.stage === 4);
  });

  it('without the Examiner, written questions are left out up to Proficient, and Advanced checks wait', () => {
    const pool = [choice, { ...choice, key: 'q2' }, written];
    const start = {
      campaignStatus: 'active' as const, activity: { id: 'x', targetStage: 2, questionCount: 2, writtenCount: 1 }, items: pool,
      competencies: [{ ...comp(), stage: 1 as const }], preference: 0 as const, weakConcepts: new Set<string>(), writtenAvailable: false,
    };
    const without = planAttempt(start, 's');
    assert.ok(without.ok && without.items.every((i) => i.kind !== 'written') && without.items.length === 2);
    const withIt = planAttempt({ ...start, writtenAvailable: true }, 's');
    assert.ok(withIt.ok && withIt.items.at(-1)!.kind === 'written' && withIt.items.length === 2);
    const advanced = planAttempt({ ...start, activity: { id: 'y', targetStage: 5, questionCount: 1, writtenCount: 1 }, competencies: [comp()] }, 's');
    assert.ok(!advanced.ok && advanced.code === 'examiner_unavailable');
  });
});

describe('next steps (Progression Advisor plan)', () => {
  const lesson = (id: string, completed = false) => ({ kind: 'lesson' as const, id, key: id, title: id, completed });
  const check = (id: string, targetStage: number, over: Partial<{ unlocked: boolean; reviewDue: boolean }> = {}) => ({
    kind: 'assessment' as const, id, key: id, title: id, competencyIds: ['geo'], targetStage, unlocked: true, reviewDue: false, ...over,
  });
  const base: PlanInput = {
    activities: [lesson('l1', true), check('c2', 2), lesson('l2'), check('c3', 3, { unlocked: false })],
    competencies: [{ id: 'geo', stage: 1 }],
    weaknesses: [],
  };

  it('with nothing due: the next lesson, then the check that moves a competency forward', () => {
    assert.deepEqual(planNextSteps(base).map((s) => [s.kind, s.activityId]), [['lesson', 'l2'], ['check', 'c2']]);
  });

  it('puts due reviews first, then due weaknesses (most urgent first), and never repeats an activity', () => {
    const input: PlanInput = {
      ...base,
      activities: [lesson('l1', true), check('c2', 2, { reviewDue: true }), lesson('l2'), check('c2b', 2)],
      competencies: [{ id: 'geo', stage: 2 }],
      weaknesses: [
        { conceptTitle: 'Low', status: 'open', due: true, priority: 1, reviewCheck: { id: 'c2b' } },
        { conceptTitle: 'High', status: 'open', due: true, priority: 9, reviewCheck: { id: 'c2' } },
        { conceptTitle: 'Not due', status: 'open', due: false, priority: 99, reviewCheck: { id: 'c2b' } },
      ],
    };
    const steps = planNextSteps(input);
    assert.deepEqual(steps.map((s) => [s.kind, s.activityId]), [['review', 'c2'], ['weakness', 'c2b'], ['lesson', 'l2']]);
    assert.equal(steps[1]!.concept, 'Low');
  });

  it('is empty when everything available is done', () => {
    assert.deepEqual(planNextSteps({ activities: [lesson('l1', true), check('c3', 3, { unlocked: false })], competencies: [{ id: 'geo', stage: 1 }], weaknesses: [] }), []);
  });
});
