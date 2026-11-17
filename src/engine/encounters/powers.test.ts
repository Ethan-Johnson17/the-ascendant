import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptableQuestion, automaticEffect, classPowers, gambitOrder, hintFor, luckyQuestion, powerInfo, powersFor, racePowers, startingResolve } from './powers.ts';
import type { BossBank } from './bossPlan.ts';
import type { AssessmentItem } from '../learning/curriculum.ts';
import { classes, races } from '../../content/character/options.ts';

const bank: BossBank = {
  competencies: [{ id: 'geo', name: 'Geography', stage: 2 }, { id: 'farm', name: 'Farming', stage: 2 }],
  questions: [
    { id: 'g1', competencyIds: ['geo'], difficulty: 1, kind: 'single_choice' },
    { id: 'g2', competencyIds: ['geo'], difficulty: 1, kind: 'single_choice' },
    { id: 'g3', competencyIds: ['geo'], difficulty: 3, kind: 'single_choice' }, // too hard at stage 2
    { id: 'f1', competencyIds: ['farm'], difficulty: 2, kind: 'single_choice' },
  ],
};

describe('race traits and class abilities', () => {
  it('character creation describes each power exactly as the battle rules do', () => {
    for (const r of races) assert.deepEqual(r.trait, { name: powerInfo[racePowers[r.id]!].name, description: powerInfo[racePowers[r.id]!].description }, r.id);
    for (const c of classes) assert.deepEqual(c.ability, { name: powerInfo[classPowers[c.id]!].name, description: powerInfo[classPowers[c.id]!].description }, c.id);
  });

  it('each player has one race trait and one class ability', () => {
    assert.deepEqual(powersFor('dwarf', 'cleric'), ['stalwart', 'sanctuary']);
    assert.deepEqual(powersFor('human', 'rogue'), ['adaptable', 'gambit']);
  });

  it('only a Dwarf starts with extra Resolve', () => {
    assert.equal(startingResolve(['stalwart', 'gambit']), 4);
    assert.equal(startingResolve(['lucky', 'gambit']), 3);
  });

  it('automatic powers act once, Sanctuary before Lucky', () => {
    assert.deepEqual(automaticEffect(false, ['lucky', 'sanctuary'], new Set(), 3, 3, true), { power: 'sanctuary', delta: 0 });
    assert.deepEqual(automaticEffect(false, ['lucky', 'sanctuary'], new Set(['sanctuary']), 3, 3, true), { power: 'lucky', delta: 0 });
    assert.deepEqual(automaticEffect(false, ['lucky'], new Set(), 3, 3, false), { power: null, delta: -1 }, 'Lucky needs a question to offer');
    assert.deepEqual(automaticEffect(true, ['second_wind'], new Set(), 3, 3, false), { power: null, delta: 0 }, 'nothing to restore');
    assert.deepEqual(automaticEffect(true, ['second_wind'], new Set(), 2, 3, false), { power: 'second_wind', delta: 1 });
    assert.deepEqual(automaticEffect(true, ['second_wind'], new Set(['second_wind']), 2, 3, false), { power: null, delta: 0 });
  });

  it('Lucky offers an unused, allowed question on the same skill; Adaptable one on another skill', () => {
    assert.equal(luckyQuestion(bank, ['g1', 'f1'], 'g1'), 'g2');
    assert.equal(luckyQuestion(bank, ['g1', 'g2', 'f1'], 'g1'), null, 'g3 is too hard for this player');
    assert.equal(adaptableQuestion(bank, ['g1', 'g2'], 'g1'), 'f1');
    assert.equal(adaptableQuestion(bank, ['g1', 'f1'], 'g1'), null);
  });

  it('Gambit moves the current question to the end, never the last one', () => {
    assert.deepEqual(gambitOrder(['a', 'b', 'c'], 0), ['b', 'c', 'a']);
    assert.equal(gambitOrder(['a', 'b', 'c'], 2), null);
  });

  it('Keen Insight never gives away the answer', () => {
    const choice = { key: 'k', concept: 'c', difficulty: 1, kind: 'single_choice', prompt: 'P', explanation: 'E', options: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }], answer: 'b' } as unknown as AssessmentItem;
    assert.deepEqual(hintFor(choice), { kind: 'remove_option', optionKey: 'a' });
    const order = { key: 'k', concept: 'c', difficulty: 1, kind: 'ordering', prompt: 'P', explanation: 'E', entries: [], answer: ['x', 'y', 'z'] } as unknown as AssessmentItem;
    assert.deepEqual(hintFor(order), { kind: 'place', entryKey: 'x', position: 0 });
  });
});
