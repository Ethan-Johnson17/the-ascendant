import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAttributeGrowth, deriveAttributes, type CompetencyStanding } from './attributeGrowth.ts';

describe('deriveAttributes', () => {
  it('is all 1s with no demonstrated knowledge', () => {
    assert.deepEqual(deriveAttributes([]), { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
  });

  it('ignores Novice competencies (no evidence yet)', () => {
    const s: CompetencyStanding[] = [{ attribute: 'int', masteryStage: 1 }, { attribute: 'int', masteryStage: 1 }];
    assert.equal(deriveAttributes(s).int, 1);
  });

  it('matches the worked example: three Competent INT competencies → INT 3', () => {
    const s: CompetencyStanding[] = Array.from({ length: 3 }, () => ({ attribute: 'int' as const, masteryStage: 3 as const }));
    assert.equal(deriveAttributes(s).int, 3);
  });

  it('adds attributes across campaigns and leaves other attributes untouched', () => {
    const history: CompetencyStanding = { attribute: 'wis', masteryStage: 4 }; // 3 points
    const economics: CompetencyStanding = { attribute: 'wis', masteryStage: 4 }; // 3 points
    const scores = deriveAttributes([history, economics]);
    assert.equal(scores.wis, 3);
    assert.equal(scores.str, 1);
  });

  it('caps at the configured maximum', () => {
    const many = Array.from({ length: 100 }, () => ({ attribute: 'cha' as const, masteryStage: 6 as const }));
    assert.equal(deriveAttributes(many).cha, defaultAttributeGrowth.maxScore);
  });

  it('rejects impossible mastery stages', () => {
    assert.throws(() => deriveAttributes([{ attribute: 'str', masteryStage: 7 as never }]), RangeError);
  });
});
