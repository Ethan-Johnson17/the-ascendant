import { addDays, DAY_MS, defaultLearningConfig, type ErrorCategory, type LearningConfig } from './config.ts';
import type { Answer } from './grading.ts';

/**
 * Weakness Bank rules (GAME_DESIGN.md §9; exit rule decided 2026-11-14).
 *
 * A wrong answer opens (or reopens) a record for its concept. Only correct answers given while a
 * review is due count toward clearing it; after `reviewGapsDays.length` of them in a row the record
 * is resolved — kept for history, never deleted. One correct answer is never enough.
 */

export interface WeaknessState {
  readonly concept: string;
  readonly status: 'open' | 'resolved';
  readonly errorCategory: ErrorCategory;
  readonly occurrenceCount: number;
  readonly correctReviews: number;
  readonly nextReviewAt: Date | null;
  readonly lastMistakeAt: Date;
  readonly lastSuccessfulReview: Date | null;
  readonly resolvedAt: Date | null;
  /** Most recent wrong answers, newest first. */
  readonly incorrectResponses: readonly Answer[];
}

export type WeaknessEvent = 'opened' | 'reopened' | 'mistake_repeated' | 'review_counted' | 'resolved' | 'not_due' | 'none';

export interface WeaknessUpdate {
  readonly state: WeaknessState | null;
  readonly event: WeaknessEvent;
}

function gap(index: number, config: LearningConfig): number {
  const gaps = config.weakness.reviewGapsDays;
  return gaps[Math.min(index, gaps.length - 1)] ?? 1;
}

/** Applies one answer about `concept` to its record (which may not exist yet). */
export function applyAnswerToWeakness(
  current: WeaknessState | null,
  answer: { concept: string; correct: boolean; errorCategory?: ErrorCategory | undefined; given: Answer | null },
  now: Date,
  config: LearningConfig = defaultLearningConfig,
): WeaknessUpdate {
  if (!answer.correct) {
    const keep = config.weakness.keepIncorrectResponses;
    const responses = answer.given === null ? current?.incorrectResponses ?? [] : [answer.given, ...(current?.incorrectResponses ?? [])].slice(0, keep);
    const state: WeaknessState = {
      concept: answer.concept,
      status: 'open',
      errorCategory: answer.errorCategory ?? current?.errorCategory ?? 'misremembered_fact',
      occurrenceCount: (current?.occurrenceCount ?? 0) + 1,
      correctReviews: 0,
      nextReviewAt: addDays(now, gap(0, config)),
      lastMistakeAt: now,
      lastSuccessfulReview: current?.lastSuccessfulReview ?? null,
      resolvedAt: null,
      incorrectResponses: responses,
    };
    const event: WeaknessEvent = current === null ? 'opened' : current.status === 'resolved' ? 'reopened' : 'mistake_repeated';
    return { state, event };
  }

  if (current === null || current.status === 'resolved') return { state: current, event: 'none' };
  if (current.nextReviewAt === null || now.getTime() < current.nextReviewAt.getTime()) return { state: current, event: 'not_due' };

  const correctReviews = current.correctReviews + 1;
  const required = config.weakness.reviewGapsDays.length;
  if (correctReviews >= required) {
    return {
      state: { ...current, status: 'resolved', correctReviews, nextReviewAt: null, lastSuccessfulReview: now, resolvedAt: now },
      event: 'resolved',
    };
  }
  return {
    state: { ...current, correctReviews, nextReviewAt: addDays(now, gap(correctReviews, config)), lastSuccessfulReview: now },
    event: 'review_counted',
  };
}

/**
 * Sort key for the review list: frequent and overdue mistakes first. Resolved records score 0.
 * Computed at read time because "overdue" changes as time passes.
 */
export function reviewPriority(state: WeaknessState, now: Date): number {
  if (state.status === 'resolved') return 0;
  const overdueDays = state.nextReviewAt ? Math.max(0, (now.getTime() - state.nextReviewAt.getTime()) / DAY_MS) : 0;
  const due = state.nextReviewAt !== null && now.getTime() >= state.nextReviewAt.getTime();
  return Math.round(state.occurrenceCount * 10 + (due ? 20 : 0) + Math.min(overdueDays, 30));
}

export function isWeaknessDue(state: WeaknessState, now: Date): boolean {
  return state.status === 'open' && state.nextReviewAt !== null && now.getTime() >= state.nextReviewAt.getTime();
}
