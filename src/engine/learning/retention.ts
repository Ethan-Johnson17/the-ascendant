import { addDays, defaultLearningConfig, type LearningConfig } from './config.ts';

/**
 * Retention scheduling for competencies (spaced repetition, GAME_DESIGN.md §9).
 *
 * A competency's review "step" indexes the interval list. Passing a due review moves one step up;
 * failing one moves back, flags the competency as needing review, and never touches its mastery stage.
 */

export const retentionStatuses = ['not_started', 'fresh', 'due', 'needs_review'] as const;
export type RetentionStatus = (typeof retentionStatuses)[number];

export interface RetentionState {
  /** Index into `intervalsDays`; null until the competency has first been demonstrated. */
  readonly step: number | null;
  readonly nextReviewAt: Date | null;
  readonly needsReview: boolean;
  readonly lastDemonstratedAt: Date | null;
}

export const freshRetention: RetentionState = { step: null, nextReviewAt: null, needsReview: false, lastDemonstratedAt: null };

export function isReviewDue(state: RetentionState, now: Date): boolean {
  return state.nextReviewAt !== null && now.getTime() >= state.nextReviewAt.getTime();
}

export function retentionStatus(state: RetentionState, now: Date): RetentionStatus {
  if (state.step === null) return 'not_started';
  if (state.needsReview) return 'needs_review';
  return isReviewDue(state, now) ? 'due' : 'fresh';
}

/** 0–1 summary for display: how far up the interval ladder the competency is. */
export function retentionStrength(state: RetentionState, config: LearningConfig = defaultLearningConfig): number | null {
  if (state.step === null) return null;
  const max = config.retention.intervalsDays.length - 1;
  return max <= 0 ? 1 : Math.round(((state.step + 1) / (max + 1)) * 100) / 100;
}

export interface RetentionUpdate {
  readonly state: RetentionState;
  /** True when this result answered a review the game had scheduled and that was due. */
  readonly wasDueReview: boolean;
  /** The due time of the review this result answered (identifies it for XP); null if none. */
  readonly reviewDueAt: Date | null;
}

function interval(step: number, config: LearningConfig): number {
  const list = config.retention.intervalsDays;
  return list[Math.min(Math.max(step, 0), list.length - 1)] ?? 1;
}

/**
 * Applies one check result for a competency. Results that are not due reviews only start the
 * schedule (first pass) and otherwise leave it alone, so cramming cannot climb the ladder.
 */
export function applyRetentionResult(state: RetentionState, passed: boolean, now: Date, config: LearningConfig = defaultLearningConfig): RetentionUpdate {
  const due = isReviewDue(state, now);
  if (state.step === null) {
    if (!passed) return { state, wasDueReview: false, reviewDueAt: null };
    return {
      state: { step: 0, nextReviewAt: addDays(now, interval(0, config)), needsReview: false, lastDemonstratedAt: now },
      wasDueReview: false,
      reviewDueAt: null,
    };
  }
  if (!due) {
    return { state: passed ? { ...state, lastDemonstratedAt: now } : state, wasDueReview: false, reviewDueAt: null };
  }
  const reviewDueAt = state.nextReviewAt;
  const max = config.retention.intervalsDays.length - 1;
  const step = passed ? Math.min(state.step + 1, max) : Math.max(state.step - config.retention.stepsBackOnFailure, 0);
  return {
    state: {
      step,
      // A failed review comes back after the shortest interval.
      nextReviewAt: addDays(now, passed ? interval(step, config) : interval(0, config)),
      needsReview: !passed,
      lastDemonstratedAt: passed ? now : state.lastDemonstratedAt,
    },
    wasDueReview: true,
    reviewDueAt,
  };
}
