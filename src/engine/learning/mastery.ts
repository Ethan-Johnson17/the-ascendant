import type { MasteryStage } from '../character/attributeGrowth.ts';
import { defaultLearningConfig, HOUR_MS, type LearningConfig } from './config.ts';

/**
 * Evidence-based mastery (GAME_DESIGN.md §5 "Learning rules", §7). XP never moves a stage;
 * only recorded passes of checks written for the next stage do.
 */

export interface StageEvidence {
  /** Times the player passed a check targeting `stage`, in any order. */
  readonly passTimes: readonly Date[];
}

/**
 * Counts passes that are at least `minHoursBetweenPasses` apart, greedily from the earliest.
 * Two passes an hour apart count once; passes on two different days count twice.
 */
export function countSpacedPasses(passTimes: readonly Date[], config: LearningConfig = defaultLearningConfig): number {
  const sorted = [...passTimes].map((d) => d.getTime()).sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const t of sorted) {
    if (t - last >= config.mastery.minHoursBetweenPasses * HOUR_MS) {
      count++;
      last = t;
    }
  }
  return count;
}

/** Whether a check written for `targetStage` may be taken by someone at `currentStage`. */
export function checkUnlocked(currentStage: MasteryStage, targetStage: number): boolean {
  return targetStage <= currentStage + 1;
}

export interface MasteryDecision {
  readonly stage: MasteryStage;
  readonly advanced: boolean;
  /** Spaced passes counted toward the next stage (after this decision). */
  readonly spacedPasses: number;
  readonly passesRequired: number;
  /** Why the stage did not advance, in plain language; null if it advanced or is capped. */
  readonly reason: string | null;
}

/**
 * Decides a competency's stage after new evidence. `passTimesForNext` are all recorded passes of
 * checks targeting `currentStage + 1` (including the one just made). Stages advance one at a time
 * and never above the self-marked cap.
 */
export function decideMastery(
  currentStage: MasteryStage,
  passTimesForNext: readonly Date[],
  config: LearningConfig = defaultLearningConfig,
  /** Highest stage this evidence can reach: self-marked checks stop at Proficient, written work at Advanced. */
  cap: number = config.mastery.maxStageFromChecks,
): MasteryDecision {
  const required = config.mastery.passesRequired;
  if (currentStage >= cap) {
    return { stage: currentStage, advanced: false, spacedPasses: 0, passesRequired: required, reason: null };
  }
  const spaced = countSpacedPasses(passTimesForNext, config);
  if (spaced >= required) {
    return { stage: (currentStage + 1) as MasteryStage, advanced: true, spacedPasses: spaced, passesRequired: required, reason: null };
  }
  const reason =
    passTimesForNext.length === 0
      ? 'Pass this stage’s check to begin advancing.'
      : `Passed on ${spaced} of ${required} separate days. Pass again at least ${config.mastery.minHoursBetweenPasses} hours after your last counted pass.`;
  return { stage: currentStage, advanced: false, spacedPasses: spaced, passesRequired: required, reason };
}
