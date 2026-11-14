import { assertValidCurve, type LevelCurve } from './config.ts';

/** Total XP needed to reach `level` (level 1 requires 0). */
export function totalXpForLevel(level: number, curve: LevelCurve): number {
  assertValidCurve(curve);
  if (!Number.isInteger(level) || level < 1 || level > curve.maxLevel) {
    throw new RangeError(`level must be an integer between 1 and ${curve.maxLevel} (got ${level})`);
  }
  return Math.round(curve.base * Math.pow(level - 1, curve.exponent));
}

export interface LevelState {
  readonly level: number;
  /** XP earned since reaching the current level. */
  readonly xpIntoLevel: number;
  /** XP span of the current level, or null at max level. */
  readonly xpForNextLevel: number | null;
  readonly isMaxLevel: boolean;
}

/**
 * Derives level from a total XP figure. Level is always *derived* from the XP ledger,
 * never stored as an independently editable number, so it cannot drift out of sync.
 */
export function levelFromXp(totalXp: number, curve: LevelCurve): LevelState {
  assertValidCurve(curve);
  if (!Number.isFinite(totalXp) || totalXp < 0 || !Number.isInteger(totalXp)) {
    throw new RangeError(`totalXp must be a non-negative integer (got ${totalXp})`);
  }

  let level = 1;
  while (level < curve.maxLevel && totalXp >= totalXpForLevel(level + 1, curve)) level++;

  const floor = totalXpForLevel(level, curve);
  if (level === curve.maxLevel) {
    return { level, xpIntoLevel: totalXp - floor, xpForNextLevel: null, isMaxLevel: true };
  }
  return {
    level,
    xpIntoLevel: totalXp - floor,
    xpForNextLevel: totalXpForLevel(level + 1, curve) - floor,
    isMaxLevel: false,
  };
}
