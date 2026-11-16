/**
 * Progression configuration — the single source of truth for XP values and level curves.
 *
 * Rules (ARCHITECTURE.md §Game engine):
 * - No XP number may be hardcoded anywhere else in the codebase.
 * - The engine reads this config; the AI never does arithmetic on XP.
 * - Every value here is a TUNABLE DEFAULT awaiting playtesting, not a final design decision.
 *
 * This module is pure TypeScript with no browser, Node or Deno APIs so the same code can
 * run in the browser (previews) and in Supabase Edge Functions (authoritative awards).
 */

/** Level curve: total XP required to *reach* level L is round(base * (L - 1) ^ exponent). */
export interface LevelCurve {
  readonly maxLevel: number;
  readonly base: number;
  readonly exponent: number;
}

/** Categories of meaningful educational activity, from GAME_DESIGN.md §6. */
export const xpActivityKinds = [
  'lesson_completed',
  'knowledge_check_passed',
  'concept_explained',
  'applied_problem_solved',
  'practical_project_completed',
  'retention_review_passed',
  'quest_completed',
  'boss_defeated',
] as const;
export type XpActivityKind = (typeof xpActivityKinds)[number];

export interface ProgressionConfig {
  /** Global character level (one persistent character across all campaigns). */
  readonly characterLevels: LevelCurve;
  /** Per-campaign level, tracked independently for each campaign. */
  readonly campaignLevels: LevelCurve;
  /** Base XP per activity kind, before difficulty/quality multipliers (added in Phase 2). */
  readonly baseXp: Readonly<Record<XpActivityKind, number>>;
}

export const defaultProgressionConfig: ProgressionConfig = {
  characterLevels: { maxLevel: 20, base: 100, exponent: 1.6 },
  campaignLevels: { maxLevel: 10, base: 80, exponent: 1.5 },
  baseXp: {
    lesson_completed: 10, //            small
    knowledge_check_passed: 15, //      small (first pass of each check, Phase 3)
    concept_explained: 25, //           moderate
    applied_problem_solved: 50, //      substantial
    practical_project_completed: 75, // substantial
    retention_review_passed: 20,
    quest_completed: 40,
    boss_defeated: 200, //              major
  },
};

/** Throws on a malformed config so bad tuning fails loudly at startup, not mid-game. */
export function assertValidCurve(curve: LevelCurve): void {
  if (!Number.isInteger(curve.maxLevel) || curve.maxLevel < 2) {
    throw new RangeError(`maxLevel must be an integer >= 2 (got ${curve.maxLevel})`);
  }
  if (!(curve.base > 0)) throw new RangeError(`base must be > 0 (got ${curve.base})`);
  if (!(curve.exponent >= 1)) throw new RangeError(`exponent must be >= 1 (got ${curve.exponent})`);
}
