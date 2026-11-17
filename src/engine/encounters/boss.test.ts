import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bossBank, bossGateOpen, bossQuestionIds, bossStatus, gameBossPlan, recoveryFor, resolveBossAnswer,
  type BossCourse, type BossRecords, type EncounterState, type EncounterSummary,
} from './boss.ts';
import { checkBossPlan } from './bossPlan.ts';
import { questsToComplete, recoveryQuests } from '../quests/quests.ts';
import type { AssessmentItem } from '../learning/curriculum.ts';

const q = (n: number, activityId: string, activityStage: number, difficulty: number, competencyIds = ['geo']) => ({
  id: `q${n}`, activityId, activityStage, conceptId: n % 2 ? 'rivers' : 'silt', concept: n % 2 ? 'Rivers' : 'Silt', competencyIds, difficulty, kind: 'single_choice', prompt: `Question ${n}`,
});

const course: BossCourse = {
  competencies: [{ id: 'geo', name: 'Geography' }, { id: 'farm', name: 'Farming' }],
  checks: [
    { id: 'c-geo-2', targetStage: 2, competencyIds: ['geo'] },
    { id: 'c-geo-3', targetStage: 3, competencyIds: ['geo', 'farm'] },
  ],
  questions: [q(1, 'c-geo-2', 2, 1), q(2, 'c-geo-2', 2, 1), q(3, 'c-geo-2', 2, 2), q(4, 'c-geo-2', 2, 2), q(5, 'c-geo-3', 3, 2, ['geo', 'farm']), q(6, 'c-geo-3', 3, 3, ['farm'])],
  unbuiltLessons: 0,
};

const at = (h: number) => new Date(Date.UTC(2026, 10, 17, h));
const records = (stages: Record<string, number>, encounters: EncounterSummary[] = [], checkPasses: { activityId: string; at: Date }[] = []): BossRecords => ({
  stages: new Map(Object.entries(stages)), encounters, checkPasses,
});
const fight = (stage: number, status: EncounterSummary['status'], start: number, missed: string[] = []): EncounterSummary => ({
  id: `e-${stage}-${start}`, stage, status, startedAt: at(start), endedAt: status === 'active' ? null : at(start + 1), missedConceptIds: missed,
});

describe('boss gate', () => {
  it('Novice and Apprentice checks are never gated; higher ones need the boss of the stage below', () => {
    assert.equal(bossGateOpen(2, new Set()), true);
    assert.equal(bossGateOpen(3, new Set()), false);
    assert.equal(bossGateOpen(3, new Set([2])), true);
    assert.equal(bossGateOpen(4, new Set([2])), false);
    assert.equal(bossGateOpen(5, new Set([2, 3, 4])), true);
  });
});

describe('boss status', () => {
  it('is locked until every tested skill reaches the stage', () => {
    const s = bossStatus(course, records({}), 2);
    assert.equal(s.kind, 'locked');
    assert.match((s as { reason: string }).reason, /Geography/);
  });

  it('is ready once the skills are there and enough checked questions exist', () => {
    assert.equal(bossStatus(course, records({ geo: 2 }), 2).kind, 'ready');
  });

  it('a higher boss cannot open before the one below is beaten (no premature unlock)', () => {
    const s = bossStatus(course, records({ geo: 3, farm: 3 }), 3);
    assert.equal(s.kind, 'locked');
    assert.match((s as { reason: string }).reason, /Apprentice boss/);
  });

  it('waits while an AI course still has lessons to build', () => {
    const s = bossStatus({ ...course, unbuiltLessons: 2 }, records({ geo: 2 }), 2);
    assert.equal(s.kind, 'locked');
    assert.match((s as { reason: string }).reason, /2 still to build/);
  });

  it('a stage with no checks has no boss', () => {
    assert.equal(bossStatus(course, records({ geo: 4, farm: 4 }), 4).kind, 'unavailable');
  });

  it('reports won and active battles first', () => {
    assert.equal(bossStatus(course, records({}, [fight(2, 'won', 1)]), 2).kind, 'won');
    assert.deepEqual(bossStatus(course, records({ geo: 2 }, [fight(2, 'active', 1)]), 2), { kind: 'active', encounterId: 'e-2-1' });
  });

  it('after a defeat, asks for recovery: passing the check again afterwards opens the boss again', () => {
    const lost = fight(2, 'lost', 1, ['rivers', 'silt', 'rivers']);
    const before = bossStatus(course, records({ geo: 2 }, [lost], [{ activityId: 'c-geo-2', at: at(0) }]), 2);
    assert.equal(before.kind, 'recover');
    const rec = (before as { recovery: ReturnType<typeof recoveryFor> }).recovery!;
    assert.equal(rec.steps.length, 1, 'one check covers both missed concepts');
    assert.equal(rec.steps[0]!.checkId, 'c-geo-2');
    assert.equal(rec.losses, 1);
    assert.equal(bossStatus(course, records({ geo: 2 }, [lost], [{ activityId: 'c-geo-2', at: at(5) }]), 2).kind, 'ready');
  });
});

describe('boss plan from the game', () => {
  it('follows the plan rules and uses only questions the bank allows', () => {
    const { bank } = bossBank(course, records({ geo: 2 }), 2);
    const plan = gameBossPlan(2, bank, new Map([['geo', 'Geography']]));
    assert.deepEqual(checkBossPlan(bank, plan.rounds), []);
    assert.deepEqual(bossQuestionIds(plan), ['q1', 'q2', 'q3', 'q4']);
    assert.equal(plan.name, 'The Apprentice Trial');
  });

  it('a stage’s boss draws only on checks up to that stage', () => {
    const { questions } = bossBank(course, records({ geo: 2 }), 2);
    assert.ok(questions.every((x) => x.activityStage <= 2));
  });
});

describe('boss answers', () => {
  const item = (key: string): AssessmentItem => ({
    key, concept: 'rivers', difficulty: 1, kind: 'single_choice', prompt: 'P', explanation: 'E',
    options: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B', errorCategory: 'related_concept_confusion' }], answer: 'a',
  }) as unknown as AssessmentItem;
  const state = (over: Partial<EncounterState> = {}): EncounterState => ({ id: 'e', campaignId: 'camp', stage: 2, status: 'active', resolve: 3, position: 0, questionIds: ['q1', 'q2', 'q3'], ...over });

  it('a wrong answer costs 1 Resolve and opens a weak spot; a right one costs nothing', () => {
    const wrong = resolveBossAnswer(state(), 'active', item('q1'), 'b', null, at(1));
    assert.ok(wrong.ok);
    assert.equal(wrong.resolve, 2);
    assert.equal(wrong.status, 'active');
    assert.equal(wrong.weakness?.event, 'opened');
    const right = resolveBossAnswer(state(), 'active', item('q1'), 'a', null, at(1));
    assert.ok(right.ok);
    assert.equal(right.resolve, 3);
    assert.equal(right.weakness, null);
  });

  it('the battle is lost at 0 Resolve, with no XP', () => {
    const r = resolveBossAnswer(state({ resolve: 1, position: 1 }), 'active', item('q2'), 'b', null, at(1));
    assert.ok(r.ok);
    assert.equal(r.status, 'lost');
    assert.equal(r.xp, null);
  });

  it('answering the last question with Resolve left wins, with XP keyed to the boss', () => {
    const r = resolveBossAnswer(state({ resolve: 1, position: 2 }), 'active', item('q3'), 'a', null, at(1));
    assert.ok(r.ok);
    assert.equal(r.status, 'won');
    assert.equal(r.xp?.amount, 200);
    assert.equal(r.xp?.idempotencyKey, 'boss_defeated:camp/stage-2');
  });

  it('refuses answers to the wrong question, after the battle, or in a paused campaign', () => {
    assert.equal((resolveBossAnswer(state(), 'active', item('q2'), 'a', null, at(1)) as { code: string }).code, 'wrong_question');
    assert.equal((resolveBossAnswer(state({ status: 'won' }), 'active', item('q1'), 'a', null, at(1)) as { code: string }).code, 'not_active');
    assert.equal((resolveBossAnswer(state(), 'paused', item('q1'), 'a', null, at(1)) as { code: string }).code, 'campaign_inactive');
  });
});

describe('recovery quests', () => {
  it('give no XP and are never recorded, so they cannot be farmed', () => {
    const rec = recoveryFor(course, records({ geo: 2 }, [fight(2, 'lost', 1, ['rivers'])]), 2)!;
    const [quest] = recoveryQuests([rec], new Map([['c-geo-2', 'Rivers check']]));
    assert.equal(quest!.key, 'recover-2-1');
    assert.equal(quest!.xp, 0);
    assert.equal(quest!.status, 'active');
    const done = recoveryQuests([{ ...rec, done: true, steps: rec.steps.map((s) => ({ ...s, done: true })) }], new Map());
    assert.equal(done[0]!.status, 'completed');
    assert.deepEqual(questsToComplete([...done, { ...done[0]!, status: 'ready' }], 'camp'), []);
  });
});
