import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuests, questsToComplete, type QuestCourse, type QuestRecords } from './quests.ts';
import { defaultProgressionConfig } from '../progression/config.ts';

const course: QuestCourse = {
  campaignId: 'c1',
  competencies: [{ id: 'geo', name: 'Geography' }, { id: 'farm', name: 'Agriculture' }],
  objectives: [
    {
      id: 't/o1', key: 'o1', title: 'Describe the rivers.', topic: 'Land',
      activities: [
        { id: 't/l1', kind: 'lesson', title: 'Land between rivers', targetStage: null, competencyIds: ['geo'] },
        { id: 't/c1', kind: 'assessment', title: 'Rivers check', targetStage: 2, competencyIds: ['geo'] },
        { id: 't/c1b', kind: 'assessment', title: 'Rivers in depth', targetStage: 3, competencyIds: ['geo'] },
      ],
    },
    { id: 't/o2', key: 'o2', title: 'Trace farming.', topic: 'Farming', activities: [{ id: 't/l2', kind: 'lesson', title: 'First farmers', targetStage: null, competencyIds: ['farm'] }] },
  ],
};

const records = (over: Partial<QuestRecords> = {}): QuestRecords => ({
  completedLessonIds: new Set(), passedCheckIds: new Set(), resolvedWeaknesses: 0, openWeaknesses: 0, reviewsPassed: 0,
  stages: new Map(), completedQuestKeys: new Set(), ...over,
});
const byKey = (r: QuestRecords) => new Map(buildQuests(course, r).map((q) => [q.key, q] as const));

describe('quests (engine)', () => {
  it('builds a learning quest per objective with stable keys, from the course itself', () => {
    const q = byKey(records());
    assert.deepEqual([...q.keys()], ['learn-o1', 'deepen-o1-3', 'learn-o2', 'prepare-2']);
    const learn = q.get('learn-o1')!;
    assert.equal(learn.title, 'Land between rivers');
    assert.deepEqual(learn.objectives.map((o) => o.id), ['t/l1', 't/c1']);
    assert.equal(learn.status, 'active');
    assert.equal(learn.xp, defaultProgressionConfig.baseXp.quest_completed);
  });

  it('progresses only from real records, and is ready when every step is done', () => {
    assert.equal(byKey(records({ completedLessonIds: new Set(['t/l1']) })).get('learn-o1')!.status, 'active');
    const ready = records({ completedLessonIds: new Set(['t/l1']), passedCheckIds: new Set(['t/c1']) });
    assert.equal(byKey(ready).get('learn-o1')!.status, 'ready');
    const plans = questsToComplete(buildQuests(course, ready), 'c1');
    assert.deepEqual(plans.map((p) => [p.key, p.xp.idempotencyKey]), [['learn-o1', 'quest_completed:c1/learn-o1']]);
  });

  it('a completed quest is never offered for completion again', () => {
    const r = records({ completedLessonIds: new Set(['t/l1']), passedCheckIds: new Set(['t/c1']), completedQuestKeys: new Set(['learn-o1']) });
    assert.equal(byKey(r).get('learn-o1')!.status, 'completed');
    assert.deepEqual(questsToComplete(buildQuests(course, r), 'c1'), []);
  });

  it('mastery quests open when their skills reach the stage below', () => {
    assert.equal(byKey(records()).get('deepen-o1-3')!.status, 'locked');
    assert.match(byKey(records()).get('deepen-o1-3')!.lockedReason!, /Geography reaches Apprentice/);
    assert.equal(byKey(records({ stages: new Map([['geo', 2]]) })).get('deepen-o1-3')!.status, 'active');
  });

  it('shows only the next boss-preparation gate, for skills the course can test', () => {
    assert.deepEqual(byKey(records()).get('prepare-2')!.objectives.map((o) => o.id), ['geo'], 'skills with no check yet are left out');
    const atApprentice = records({ stages: new Map([['geo', 2]]) });
    assert.equal(byKey(atApprentice).get('prepare-2')!.status, 'ready');
    assert.equal(byKey(atApprentice).has('prepare-3'), false);
    const after = records({ stages: new Map([['geo', 2]]), completedQuestKeys: new Set(['prepare-2']) });
    assert.equal(byKey(after).get('prepare-3')!.status, 'active');
  });

  it('review and retention quests count milestones and appear only when relevant', () => {
    assert.equal(byKey(records()).has('review-1'), false, 'no weak spots yet');
    const q = byKey(records({ openWeaknesses: 2, resolvedWeaknesses: 1, completedQuestKeys: new Set(['review-1']), stages: new Map([['geo', 2]]) }));
    assert.equal(q.get('review-1')!.status, 'completed');
    assert.equal(q.get('review-3')!.objectives[0]!.label, '1 of 3');
    assert.equal(q.has('review-6'), false);
    assert.equal(q.get('retention-1')!.status, 'active');
  });
});
