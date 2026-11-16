import { z } from 'zod';
import type { ErrorCategory } from './config.ts';
import type { AssessmentItem } from './curriculum.ts';

/**
 * Marks answers. Deterministic: the same item, answer and Examiner mark always give the same
 * result, so the mark can be recomputed and audited later.
 *
 * Written answers are judged criterion by criterion by the Examiner (AI); that judgement arrives
 * here as a `WrittenMark`. The engine, not the AI, adds up the points and decides correct or not.
 */

export const answerSchema = z.union([
  // Choice keys are short; written answers are longer free text (capped per item by `maxChars`).
  z.string().max(2000),
  z.array(z.string().max(60)).max(10),
  z.record(z.string().max(60), z.string().max(60)),
]);
export type Answer = z.infer<typeof answerSchema>;

/** The Examiner's judgement of one written answer, after the server has checked it. */
export interface WrittenMark {
  /** Keys of the rubric criteria the answer meets. Unknown keys are ignored. */
  readonly criteriaMet: readonly string[];
  /** False when the Examiner was not highly confident, or its judgement failed our checks. */
  readonly confident: boolean;
  readonly errorCategory?: ErrorCategory | undefined;
}

export interface ItemResult {
  readonly itemKey: string;
  readonly concept: string;
  readonly correct: boolean;
  /** Present only for a wrong (or missing / malformed) answer. */
  readonly errorCategory?: ErrorCategory;
  /** The player's answer exactly as submitted (null when none was given). */
  readonly given: Answer | null;
  /** Written answers only: rubric points earned, needed and available. */
  readonly points?: { readonly earned: number; readonly required: number; readonly total: number };
}

const isRecord = (a: Answer): a is Record<string, string> => typeof a === 'object' && !Array.isArray(a);

/** A written answer with any text in it needs the Examiner; a blank one is simply wrong. */
export function needsExaminer(item: AssessmentItem, given: Answer | null | undefined): boolean {
  return item.kind === 'written' && typeof given === 'string' && given.trim().length > 0;
}

export function gradeItem(item: AssessmentItem, given: Answer | null | undefined, mark?: WrittenMark): ItemResult {
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
    case 'written': {
      const total = item.criteria.reduce((s, c) => s + c.points, 0);
      const points = (earned: number) => ({ earned, required: item.passPoints, total });
      if (typeof given !== 'string' || !given.trim() || given.length > item.maxChars) return { ...wrong(), points: points(0) };
      if (!mark) throw new Error(`Written answer "${item.key}" needs an Examiner mark`);
      const met = new Set(mark.criteriaMet);
      const earned = item.criteria.filter((c) => met.has(c.key)).reduce((s, c) => s + c.points, 0);
      return earned >= item.passPoints ? { ...base, correct: true, points: points(earned) } : { ...wrong(mark.errorCategory ?? item.errorCategory), points: points(earned) };
    }
  }
}

export interface AttemptGrade {
  readonly results: readonly ItemResult[];
  readonly correct: number;
  readonly total: number;
  readonly score: number;
  readonly passed: boolean;
  /** False when any written answer's marking was not confident: the attempt then does not count. */
  readonly confident: boolean;
}

/** Marks every issued item. Answers for items that were not issued are ignored. */
export function gradeAttempt(
  items: readonly AssessmentItem[],
  answers: Readonly<Record<string, Answer>>,
  passMark: number,
  marks: Readonly<Record<string, WrittenMark>> = {},
): AttemptGrade {
  if (items.length === 0) throw new RangeError('An attempt must have at least one question');
  const results = items.map((item) => gradeItem(item, answers[item.key], marks[item.key]));
  const correct = results.filter((r) => r.correct).length;
  const score = correct / items.length;
  const confident = items.every((item) => !needsExaminer(item, answers[item.key]) || marks[item.key]?.confident === true);
  return { results, correct, total: items.length, score, passed: confident && score >= passMark, confident };
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
    case 'written':
      // The rubric is the answer key: it is shown only after marking.
      return { ...common, maxChars: item.maxChars };
  }
}
export type PublicItem = ReturnType<typeof publicItem>;
