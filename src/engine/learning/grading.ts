import { z } from 'zod';
import type { ErrorCategory } from './config.ts';
import type { AssessmentItem } from './curriculum.ts';

/**
 * Marks answers to self-gradable questions. Deterministic: the same item and answer always give
 * the same result, so the mark can be recomputed and audited later.
 */

export const answerSchema = z.union([
  z.string().max(60),
  z.array(z.string().max(60)).max(10),
  z.record(z.string().max(60), z.string().max(60)),
]);
export type Answer = z.infer<typeof answerSchema>;

export interface ItemResult {
  readonly itemKey: string;
  readonly concept: string;
  readonly correct: boolean;
  /** Present only for a wrong (or missing / malformed) answer. */
  readonly errorCategory?: ErrorCategory;
  /** The player's answer exactly as submitted (null when none was given). */
  readonly given: Answer | null;
}

const isRecord = (a: Answer): a is Record<string, string> => typeof a === 'object' && !Array.isArray(a);

export function gradeItem(item: AssessmentItem, given: Answer | null | undefined): ItemResult {
  const base = { itemKey: item.key, concept: item.concept, given: given ?? null };
  const wrong = (category: ErrorCategory = item.errorCategory): ItemResult => ({ ...base, correct: false, errorCategory: category });
  if (given === null || given === undefined) return wrong();

  switch (item.kind) {
    case 'single_choice': {
      if (typeof given !== 'string') return wrong();
      if (given === item.answer) return { ...base, correct: true };
      return wrong(item.options.find((o) => o.key === given)?.errorCategory ?? item.errorCategory);
    }
    case 'ordering': {
      if (!Array.isArray(given)) return wrong();
      const ok = given.length === item.answer.length && given.every((k, i) => k === item.answer[i]);
      return ok ? { ...base, correct: true } : wrong();
    }
    case 'matching': {
      if (!isRecord(given)) return wrong();
      const pairs = Object.entries(item.answer);
      const ok = Object.keys(given).length === pairs.length && pairs.every(([l, r]) => given[l] === r);
      return ok ? { ...base, correct: true } : wrong();
    }
  }
}

export interface AttemptGrade {
  readonly results: readonly ItemResult[];
  readonly correct: number;
  readonly total: number;
  readonly score: number;
  readonly passed: boolean;
}

/** Marks every issued item. Answers for items that were not issued are ignored. */
export function gradeAttempt(items: readonly AssessmentItem[], answers: Readonly<Record<string, Answer>>, passMark: number): AttemptGrade {
  if (items.length === 0) throw new RangeError('An attempt must have at least one question');
  const results = items.map((item) => gradeItem(item, answers[item.key]));
  const correct = results.filter((r) => r.correct).length;
  const score = correct / items.length;
  return { results, correct, total: items.length, score, passed: score >= passMark };
}

/** What the player may see of a question before answering: everything except the answer key. */
export function publicItem(item: AssessmentItem) {
  const common = { key: item.key, kind: item.kind, difficulty: item.difficulty, prompt: item.prompt };
  switch (item.kind) {
    case 'single_choice':
      return { ...common, options: item.options.map((o) => ({ key: o.key, text: o.text })) };
    case 'ordering':
      return { ...common, entries: item.entries };
    case 'matching':
      return { ...common, left: item.left, right: item.right };
  }
}
export type PublicItem = ReturnType<typeof publicItem>;
