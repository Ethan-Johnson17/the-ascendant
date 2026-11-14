import { attributeIds, defaultCharacterRules, type AttributeId, type AttributeScores } from './attributes.ts';

/**
 * Attribute growth (GAME_DESIGN.md §3 "Attribute sub-skills and growth", decided 2026-11-14).
 *
 * Every competency belongs to one sub-skill, and every sub-skill to one attribute. A competency
 * earns points by mastery stage; an attribute's score is the starting score plus one per
 * `pointsPerScore` points from all competencies tied to it, across all campaigns, capped.
 *
 * All numbers are TUNABLE configuration. No other code may hardcode them.
 */

/** Mastery stages, GAME_DESIGN.md §7. Index 0 = stage 1. */
export const masteryStages = ['Novice', 'Apprentice', 'Competent', 'Proficient', 'Advanced', 'Expert'] as const;
export type MasteryStage = 1 | 2 | 3 | 4 | 5 | 6;

export interface AttributeGrowthConfig {
  /** Points a competency contributes at each stage (index 0 = Novice). */
  readonly pointsByStage: readonly [number, number, number, number, number, number];
  readonly pointsPerScore: number;
  readonly startingScore: number;
  readonly maxScore: number;
}

export const defaultAttributeGrowth: AttributeGrowthConfig = {
  pointsByStage: [0, 1, 2, 3, 4, 5],
  pointsPerScore: 3,
  startingScore: defaultCharacterRules.startingAttributeScore,
  maxScore: defaultCharacterRules.maxAttributeScore,
};

/** One competency's current state, wherever it comes from (any campaign). */
export interface CompetencyStanding {
  readonly attribute: AttributeId;
  readonly masteryStage: MasteryStage;
}

export function attributePoints(standings: readonly CompetencyStanding[], config: AttributeGrowthConfig = defaultAttributeGrowth) {
  const points: Record<AttributeId, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  for (const s of standings) {
    if (!Number.isInteger(s.masteryStage) || s.masteryStage < 1 || s.masteryStage > 6) {
      throw new RangeError(`masteryStage must be 1–6 (got ${s.masteryStage})`);
    }
    points[s.attribute] += config.pointsByStage[s.masteryStage - 1] ?? 0;
  }
  return points;
}

/** Derives all six scores from competency standings. Pure and deterministic. */
export function deriveAttributes(standings: readonly CompetencyStanding[], config: AttributeGrowthConfig = defaultAttributeGrowth): AttributeScores {
  if (!(config.pointsPerScore > 0)) throw new RangeError('pointsPerScore must be > 0');
  const points = attributePoints(standings, config);
  const scores = {} as Record<AttributeId, number>;
  for (const id of attributeIds) {
    scores[id] = Math.min(config.maxScore, config.startingScore + Math.floor(points[id] / config.pointsPerScore));
  }
  return scores;
}
