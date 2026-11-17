import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedDifficulties, bossReadiness, checkBossPlan, focusBank, type BossBank } from './bossPlan.ts';

const q = (id: string, competencyId: string, difficulty: number, kind = 'single_choice') => ({ id, competencyIds: [competencyId], difficulty, kind });
const bank: BossBank = {
  competencies: [
    { id: 'geo', name: 'Geography', stage: 2 },
    { id: 'farm', name: 'Agriculture', stage: 4 },
  ],
  questions: [q('g1', 'geo', 1), q('g2', 'geo', 2), q('g3', 'geo', 3), q('f1', 'farm', 1), q('f2', 'farm', 2), q('f3', 'farm', 3), q('w1', 'geo', 1, 'written')],
};

describe('boss plans (engine)', () => {
  it('matches question difficulty to the player’s demonstrated mastery', () => {
    assert.deepEqual(allowedDifficulties(1), [1, 2]);
    assert.deepEqual(allowedDifficulties(3), [1, 2, 3]);
    assert.deepEqual(allowedDifficulties(5), [2, 3]);
  });

  it('accepts a plan that follows every rule', () => {
    const rounds = [{ competencyId: 'geo', questionIds: ['g1'] }, { competencyId: 'farm', questionIds: ['f2', 'f3'] }, { competencyId: 'geo', questionIds: ['g2'] }];
    assert.deepEqual(checkBossPlan(bank, rounds), []);
  });

  it('rejects invented, repeated, mismatched or too-easy questions', () => {
    const problems = checkBossPlan(bank, [
      { competencyId: 'geo', questionIds: ['made-up'] },
      { competencyId: 'geo', questionIds: ['f2'] },
      { competencyId: 'farm', questionIds: ['f1'] }, // too easy for a stage-4 player
      { competencyId: 'geo', questionIds: ['g1', 'g1'] },
      { competencyId: 'geo', questionIds: ['g3'] }, // too hard for stage 2
    ]);
    assert.deepEqual(new Set(problems), new Set(['unknown_question', 'wrong_competency', 'not_eligible', 'repeated_question']));
  });

  it('rejects written questions, too few rounds, and skipped competencies', () => {
    assert.ok(checkBossPlan(bank, [{ competencyId: 'geo', questionIds: ['w1'] }]).includes('not_eligible'));
    const p = checkBossPlan(bank, [{ competencyId: 'geo', questionIds: ['g1'] }, { competencyId: 'geo', questionIds: ['g2'] }]);
    assert.ok(p.includes('round_count') && p.includes('missing_competency'));
  });

  it('is not ready when a competency has nothing to ask, and focuses on what can be asked', () => {
    const thin: BossBank = { competencies: [...bank.competencies, { id: 'law', name: 'Law', stage: 1 }], questions: bank.questions };
    assert.equal(bossReadiness(thin).ready, false);
    const focused = focusBank(thin);
    assert.deepEqual(focused.competencies.map((c) => c.id), ['geo', 'farm']);
    assert.equal(bossReadiness(focused).ready, true);
    assert.equal(bossReadiness({ competencies: [bank.competencies[0]!], questions: [q('g1', 'geo', 1)] }).ready, false, 'too few questions for 3 rounds');
  });
});
