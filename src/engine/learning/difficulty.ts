import { defaultLearningConfig, type Difficulty, type DifficultyPreference, type LearningConfig } from './config.ts';
import type { AssessmentItem } from './curriculum.ts';

/**
 * Adaptive difficulty (GAME_DESIGN.md §5 "Adaptive difficulty") and question selection.
 * Deterministic: given the same history and seed, the same questions are chosen.
 */

export interface DifficultyInputs {
  /** Correct/incorrect results for this competency, newest first. */
  readonly recentResults: readonly boolean[];
  readonly openWeaknesses: number;
  readonly preference: DifficultyPreference;
  /** Difficulty of the last check in this competency; null if none yet. */
  readonly lastDifficulty: Difficulty | null;
}

const clamp = (n: number): Difficulty => (n <= 1 ? 1 : n >= 3 ? 3 : 2) as Difficulty;

export function recommendDifficulty(inputs: DifficultyInputs, config: LearningConfig = defaultLearningConfig): Difficulty {
  const c = config.difficulty;
  let level: number = inputs.lastDifficulty ?? 2;
  const recent = inputs.recentResults.slice(0, c.window);
  if (recent.length >= c.minAnswers) {
    const accuracy = recent.filter(Boolean).length / recent.length;
    if (accuracy >= c.raiseAtAccuracy) level += 1;
    else if (accuracy < c.lowerBelowAccuracy) level -= 1;
  }
  if (inputs.openWeaknesses >= c.holdAtOpenWeaknesses) level = Math.min(level, 2);
  return clamp(level + inputs.preference);
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], next: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Picks `count` questions: those at the target difficulty first, then the nearest difficulties.
 * Questions about the player's open weaknesses are preferred within each tier so the check doubles
 * as review. Order within the attempt is shuffled.
 */
export function selectItems(
  items: readonly AssessmentItem[],
  count: number,
  target: Difficulty,
  seed: string,
  weakConcepts: ReadonlySet<string> = new Set(),
): AssessmentItem[] {
  if (count < 1) throw new RangeError('count must be at least 1');
  const next = rng(seed);
  const ranked = shuffle(items, next).sort((a, b) => {
    const dist = Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target);
    if (dist !== 0) return dist;
    return Number(weakConcepts.has(b.concept)) - Number(weakConcepts.has(a.concept));
  });
  return shuffle(ranked.slice(0, count), next);
}
