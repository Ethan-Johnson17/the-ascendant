import type { AssessmentItem } from '../learning/curriculum.ts';
import { eligibleQuestions, type BossBank } from './bossPlan.ts';

/**
 * Race traits and class abilities in boss battles (GAME_DESIGN.md "Race, class and background
 * effects"; details decided 2026-11-17). Each player has one race trait and one class ability, each
 * usable once per boss. They change Resolve and which question comes next, never XP, mastery, or
 * which answers are right. The engine decides every effect; the database checks it again.
 */

export const powerIds = ['adaptable', 'keen_insight', 'stalwart', 'lucky', 'second_wind', 'scout_ahead', 'gambit', 'arcane_recall', 'sanctuary'] as const;
export type PowerId = (typeof powerIds)[number];

/** Powers the player chooses to use (a button). The others act on their own. */
export const activePowers = ['adaptable', 'keen_insight', 'scout_ahead', 'gambit', 'arcane_recall'] as const;
export type ActivePowerId = (typeof activePowers)[number];
export const isActivePower = (p: string): p is ActivePowerId => (activePowers as readonly string[]).includes(p);

export const racePowers: Readonly<Record<string, PowerId>> = { human: 'adaptable', elf: 'keen_insight', dwarf: 'stalwart', halfling: 'lucky' };
export const classPowers: Readonly<Record<string, PowerId>> = { fighter: 'second_wind', ranger: 'scout_ahead', rogue: 'gambit', wizard: 'arcane_recall', cleric: 'sanctuary' };

export const powerInfo: Readonly<Record<PowerId, { readonly name: string; readonly source: 'race' | 'class'; readonly description: string }>> = {
  adaptable: { name: 'Adaptable', source: 'race', description: 'Once per boss, swap the current question for one on a different skill this boss tests.' },
  keen_insight: { name: 'Keen Insight', source: 'race', description: 'Once per boss, a hint: a wrong option is crossed out, an item placed or a pair filled in.' },
  stalwart: { name: 'Stalwart', source: 'race', description: 'You start every boss battle with 1 extra Resolve.' },
  lucky: { name: 'Lucky', source: 'race', description: 'The first wrong answer costs no Resolve, and you face a new question on the same skill.' },
  second_wind: { name: 'Second Wind', source: 'class', description: 'Your first correct answer after losing Resolve restores 1.' },
  scout_ahead: { name: 'Scout Ahead', source: 'class', description: 'Once per boss, see the next round’s skill and the ideas its questions cover.' },
  gambit: { name: 'Gambit', source: 'class', description: 'Once per boss, skip the current question and face it at the end.' },
  arcane_recall: { name: 'Arcane Recall', source: 'class', description: 'Once per boss, open the Codex entry for the current question.' },
  sanctuary: { name: 'Sanctuary', source: 'class', description: 'Your first wrong answer costs no Resolve.' },
};

export function powersFor(raceId: string, classId: string): PowerId[] {
  return [racePowers[raceId], classPowers[classId]].filter((p): p is PowerId => p !== undefined);
}

export const baseResolve = 3;
export const startingResolve = (powers: readonly PowerId[]) => baseResolve + (powers.includes('stalwart') ? 1 : 0);

/**
 * Which automatic power (if any) acts on this answer, and the Resolve change. Order: Sanctuary
 * before Lucky, so a Cleric Halfling gets both. Lucky needs a new question to offer.
 */
export function automaticEffect(
  correct: boolean,
  owned: readonly PowerId[],
  used: ReadonlySet<PowerId>,
  resolve: number,
  maxResolve: number,
  luckyQuestionAvailable: boolean,
): { power: 'sanctuary' | 'lucky' | 'second_wind' | null; delta: -1 | 0 | 1 } {
  const has = (p: PowerId) => owned.includes(p) && !used.has(p);
  if (correct) return has('second_wind') && resolve < maxResolve ? { power: 'second_wind', delta: 1 } : { power: null, delta: 0 };
  if (has('sanctuary')) return { power: 'sanctuary', delta: 0 };
  if (has('lucky') && luckyQuestionAvailable) return { power: 'lucky', delta: 0 };
  return { power: null, delta: -1 };
}

const questionOf = (bank: BossBank, id: string) => bank.questions.find((q) => q.id === id);

/** Lucky: an unused question the boss may ask on the same skill as the one just missed. */
export function luckyQuestion(bank: BossBank, questionIds: readonly string[], missedId: string): string | null {
  const missed = questionOf(bank, missedId);
  if (!missed) return null;
  const used = new Set(questionIds);
  for (const c of bank.competencies.filter((x) => missed.competencyIds.includes(x.id))) {
    const q = eligibleQuestions(bank, c.id).find((x) => !used.has(x.id));
    if (q) return q.id;
  }
  return null;
}

/** Adaptable: an unused question the boss may ask on a different tested skill. */
export function adaptableQuestion(bank: BossBank, questionIds: readonly string[], currentId: string): string | null {
  const current = questionOf(bank, currentId);
  if (!current) return null;
  const used = new Set(questionIds);
  for (const c of bank.competencies.filter((x) => !current.competencyIds.includes(x.id))) {
    const q = eligibleQuestions(bank, c.id).find((x) => !used.has(x.id));
    if (q) return q.id;
  }
  return null;
}

/** Gambit: the current question moves to the end. Not possible on the last question. */
export function gambitOrder(questionIds: readonly string[], position: number): string[] | null {
  if (position >= questionIds.length - 1) return null;
  const rest = questionIds.filter((_, i) => i !== position);
  return [...rest, questionIds[position]!];
}

export type BossHint =
  | { readonly kind: 'remove_option'; readonly optionKey: string }
  | { readonly kind: 'place'; readonly entryKey: string; readonly position: number }
  | { readonly kind: 'pair'; readonly leftKey: string; readonly rightKey: string };

/** Keen Insight: a hint the game works out from the answer key (never the answer itself). */
export function hintFor(item: AssessmentItem): BossHint | null {
  if (item.kind === 'single_choice') {
    const wrong = item.options.find((o) => o.key !== item.answer);
    return wrong ? { kind: 'remove_option', optionKey: wrong.key } : null;
  }
  if (item.kind === 'ordering') {
    const first = item.answer[0];
    return first !== undefined && item.answer.length > 1 ? { kind: 'place', entryKey: first, position: 0 } : null;
  }
  if (item.kind === 'matching') {
    const pairs = Object.entries(item.answer);
    return pairs.length > 1 ? { kind: 'pair', leftKey: pairs[0]![0], rightKey: pairs[0]![1] } : null;
  }
  return null;
}
