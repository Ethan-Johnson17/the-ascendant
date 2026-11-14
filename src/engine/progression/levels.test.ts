import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProgressionConfig, xpActivityKinds, type LevelCurve } from './config.ts';
import { levelFromXp, totalXpForLevel } from './levels.ts';

const curve = defaultProgressionConfig.characterLevels;

describe('totalXpForLevel', () => {
  it('requires 0 XP for level 1', () => {
    assert.equal(totalXpForLevel(1, curve), 0);
  });

  it('is strictly increasing across every level', () => {
    for (let level = 2; level <= curve.maxLevel; level++) {
      assert.ok(totalXpForLevel(level, curve) > totalXpForLevel(level - 1, curve), `level ${level}`);
    }
  });

  it('gets more expensive per level as the character rises', () => {
    const step = (l: number) => totalXpForLevel(l + 1, curve) - totalXpForLevel(l, curve);
    assert.ok(step(10) > step(2));
  });

  it('rejects levels outside the curve', () => {
    assert.throws(() => totalXpForLevel(0, curve), RangeError);
    assert.throws(() => totalXpForLevel(curve.maxLevel + 1, curve), RangeError);
    assert.throws(() => totalXpForLevel(2.5, curve), RangeError);
  });
});

describe('levelFromXp', () => {
  it('starts a new character at level 1', () => {
    const state = levelFromXp(0, curve);
    assert.equal(state.level, 1);
    assert.equal(state.xpIntoLevel, 0);
    assert.equal(state.isMaxLevel, false);
  });

  it('levels up exactly at the threshold, not one XP before', () => {
    const threshold = totalXpForLevel(5, curve);
    assert.equal(levelFromXp(threshold - 1, curve).level, 4);
    assert.equal(levelFromXp(threshold, curve).level, 5);
    assert.equal(levelFromXp(threshold, curve).xpIntoLevel, 0);
  });

  it('round-trips: the XP needed for every level yields that level', () => {
    for (let level = 1; level <= curve.maxLevel; level++) {
      assert.equal(levelFromXp(totalXpForLevel(level, curve), curve).level, level);
    }
  });

  it('caps at max level and reports no next threshold', () => {
    const state = levelFromXp(10_000_000, curve);
    assert.equal(state.level, curve.maxLevel);
    assert.equal(state.isMaxLevel, true);
    assert.equal(state.xpForNextLevel, null);
  });

  it('rejects negative, fractional and non-finite XP', () => {
    assert.throws(() => levelFromXp(-1, curve), RangeError);
    assert.throws(() => levelFromXp(1.5, curve), RangeError);
    assert.throws(() => levelFromXp(Number.NaN, curve), RangeError);
  });

  it('rejects a malformed curve configuration', () => {
    const bad: LevelCurve = { maxLevel: 1, base: 100, exponent: 1.5 };
    assert.throws(() => levelFromXp(0, bad), RangeError);
  });
});

describe('defaultProgressionConfig', () => {
  it('defines a positive integer base XP for every activity kind', () => {
    for (const kind of xpActivityKinds) {
      const xp = defaultProgressionConfig.baseXp[kind];
      assert.ok(Number.isInteger(xp) && xp > 0, kind);
    }
  });

  it('keeps the design-doc ordering: lesson < explanation < applied problem < boss', () => {
    const xp = defaultProgressionConfig.baseXp;
    assert.ok(xp.lesson_completed < xp.concept_explained);
    assert.ok(xp.concept_explained < xp.applied_problem_solved);
    assert.ok(xp.applied_problem_solved < xp.boss_defeated);
  });
});
