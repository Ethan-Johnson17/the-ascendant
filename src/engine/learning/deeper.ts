/**
 * "Go deeper" for AI-made courses (GAME_DESIGN.md, Part C decisions, 2026-11-17). Each lesson starts
 * with one check (Apprentice or Competent). Going deeper adds the next harder check for that lesson,
 * one stage at a time up to Advanced, written from the lesson's own text. A check is written only
 * when the player's skill is ready to take it, so AI requests are spent on checks that get used.
 */

export const deepestStage = 5; // Advanced

export type DeeperStatus =
  | { readonly kind: 'ready'; readonly stage: number }
  | { readonly kind: 'waiting'; readonly stage: number; readonly needs: number }
  | { readonly kind: 'complete' };

/**
 * The next check a lesson can get. `checkStages` are the target stages of the lesson's checks;
 * `skillStage` is the player's stage in the lesson's skill. Ready when the player could take it now
 * (one stage above their skill at most, the same rule as every check).
 */
export function deeperStatus(checkStages: readonly number[], skillStage: number): DeeperStatus {
  if (checkStages.length === 0) return { kind: 'complete' };
  const stage = Math.max(...checkStages) + 1;
  if (stage > deepestStage) return { kind: 'complete' };
  return skillStage >= stage - 1 ? { kind: 'ready', stage } : { kind: 'waiting', stage, needs: stage - 1 };
}

/** Deeper checks ask about causes and connections: never pure recall. */
export const deeperDifficulty = (difficulty: number): 2 | 3 => (difficulty >= 3 ? 3 : 2);
