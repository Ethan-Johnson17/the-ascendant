/**
 * Learning-engine configuration (GAME_DESIGN.md §5 "Learning rules", decided 2026-11-14).
 *
 * The single source of truth for mastery, retention, weakness and difficulty numbers. Every value
 * is a TUNABLE DEFAULT awaiting playtesting. Pure data: safe in the browser and in Edge Functions.
 */

/** Difficulty tiers for questions. 1 = foundation, 2 = standard, 3 = challenge. */
export const difficultyTiers = [1, 2, 3] as const;
export type Difficulty = (typeof difficultyTiers)[number];
export const difficultyNames: Readonly<Record<Difficulty, string>> = { 1: 'Foundation', 2: 'Standard', 3: 'Challenge' };

/** The player's request for easier (-1), automatic (0) or harder (+1) questions. */
export type DifficultyPreference = -1 | 0 | 1;

export const errorCategories = [
  'misremembered_fact',
  'conceptual_misunderstanding',
  'incorrect_application',
  'related_concept_confusion',
  'incomplete_explanation',
] as const;
export type ErrorCategory = (typeof errorCategories)[number];
export const errorCategoryNames: Readonly<Record<ErrorCategory, string>> = {
  misremembered_fact: 'Misremembered fact',
  conceptual_misunderstanding: 'Conceptual misunderstanding',
  incorrect_application: 'Incorrect application',
  related_concept_confusion: 'Confused related concepts',
  incomplete_explanation: 'Incomplete explanation',
};

export interface LearningConfig {
  readonly mastery: {
    /** Fraction of questions correct needed to pass a check. */
    readonly passMark: number;
    /** Separate passes needed to advance one stage. */
    readonly passesRequired: number;
    /** Minimum gap between counted passes ("two different days"). */
    readonly minHoursBetweenPasses: number;
    /** Highest stage self-marked checks can award (4 = Proficient). */
    readonly maxStageFromChecks: 2 | 3 | 4;
    /** Highest stage checks with confidently marked written answers can award (5 = Advanced). */
    readonly maxStageFromWritten: 4 | 5;
  };
  readonly retention: {
    /** Review intervals in days; a pass moves one step up, a failed due review two steps down. */
    readonly intervalsDays: readonly number[];
    readonly stepsBackOnFailure: number;
  };
  readonly weakness: {
    /** Gap before each due review: 1, then 2, then 4 days → reviews ~1, 3 and 7 days after the mistake. */
    readonly reviewGapsDays: readonly number[];
    /** Most recent wrong answers kept on a record. */
    readonly keepIncorrectResponses: number;
  };
  readonly difficulty: {
    /** Recent answers considered per competency. */
    readonly window: number;
    /** Fewer answers than this: no automatic change. */
    readonly minAnswers: number;
    readonly raiseAtAccuracy: number;
    readonly lowerBelowAccuracy: number;
    /** With this many open weaknesses in a competency, difficulty is held at standard or below. */
    readonly holdAtOpenWeaknesses: number;
  };
}

export const defaultLearningConfig: LearningConfig = {
  mastery: { passMark: 0.8, passesRequired: 2, minHoursBetweenPasses: 20, maxStageFromChecks: 4, maxStageFromWritten: 5 },
  retention: { intervalsDays: [1, 3, 7, 14, 30, 60, 120], stepsBackOnFailure: 2 },
  weakness: { reviewGapsDays: [1, 2, 4], keepIncorrectResponses: 5 },
  difficulty: { window: 10, minAnswers: 5, raiseAtAccuracy: 0.85, lowerBelowAccuracy: 0.6, holdAtOpenWeaknesses: 3 },
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}
