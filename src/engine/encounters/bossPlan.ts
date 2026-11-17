/**
 * Boss plans (GAME_DESIGN.md "Boss questions"): the Strategist (AI) proposes a boss built only from
 * the course's existing, already-checked questions; this engine code decides whether the plan is
 * allowed. The AI never writes questions or answer keys, and never chooses the difficulty rules.
 *
 * Phase 4 builds the rules and the check. Boss eligibility, combat and rewards arrive in Phase 5.
 */

export const bossRules = {
  minRounds: 3,
  maxRounds: 5,
  minQuestionsPerRound: 1,
  maxQuestionsPerRound: 3,
  maxQuestions: 12,
  /** Question kinds a boss may use. Written answers need the Examiner and are left for Phase 5. */
  kinds: ['single_choice', 'ordering', 'matching'] as const,
} as const;

/**
 * Which question difficulties (1 easy … 3 hard) a boss may use for a competency, from the player's
 * demonstrated mastery stage (1 Novice … 6 Master). Stronger players face harder questions.
 */
export function allowedDifficulties(stage: number): readonly number[] {
  if (stage <= 2) return [1, 2];
  if (stage === 3) return [1, 2, 3];
  return [2, 3];
}

export interface BossCompetency {
  readonly id: string;
  readonly name: string;
  /** The player's current mastery stage in this campaign. */
  readonly stage: number;
}

export interface BossQuestion {
  readonly id: string;
  readonly competencyIds: readonly string[];
  readonly difficulty: number;
  readonly kind: string;
}

export interface BossBank {
  readonly competencies: readonly BossCompetency[];
  readonly questions: readonly BossQuestion[];
}

/** A proposed round, using database ids (the server translates the AI's numbers first). */
export interface ProposedRound {
  readonly competencyId: string;
  readonly questionIds: readonly string[];
}

/** Questions a boss may use for a competency: allowed kind and a difficulty matching the player. */
export function eligibleQuestions(bank: BossBank, competencyId: string): BossQuestion[] {
  const c = bank.competencies.find((x) => x.id === competencyId);
  if (!c) return [];
  const ok = allowedDifficulties(c.stage);
  return bank.questions.filter(
    (q) => q.competencyIds.includes(competencyId) && ok.includes(q.difficulty) && (bossRules.kinds as readonly string[]).includes(q.kind),
  );
}

/**
 * The competencies a boss tests, chosen by the engine: those the course can already question the
 * player on, in curriculum order, at most one per round. (Phase 5 replaces this with each boss's own
 * requirements.)
 */
export function focusBank(bank: BossBank): BossBank {
  const competencies = bank.competencies.filter((c) => eligibleQuestions(bank, c.id).length > 0).slice(0, bossRules.maxRounds);
  const ids = new Set(competencies.map((c) => c.id));
  return { competencies, questions: bank.questions.filter((q) => q.competencyIds.some((id) => ids.has(id))) };
}

/**
 * Whether a fair boss can be built at all, checked before any AI request: every competency needs at
 * least one eligible question and there must be enough different questions for the minimum rounds.
 */
export function bossReadiness(bank: BossBank): { ready: true } | { ready: false; missing: readonly string[] } {
  if (bank.competencies.length === 0 || bank.competencies.length > bossRules.maxRounds) return { ready: false, missing: [] };
  const missing = bank.competencies.filter((c) => eligibleQuestions(bank, c.id).length === 0).map((c) => c.id);
  if (missing.length > 0) return { ready: false, missing };
  const distinct = new Set(bank.competencies.flatMap((c) => eligibleQuestions(bank, c.id).map((q) => q.id)));
  if (distinct.size < bossRules.minRounds) return { ready: false, missing: [] };
  return { ready: true };
}

export type BossPlanProblem =
  | 'round_count'
  | 'question_count'
  | 'unknown_competency'
  | 'unknown_question'
  | 'wrong_competency'
  | 'not_eligible'
  | 'repeated_question'
  | 'missing_competency'
  | 'too_many_questions';

/** Checks a proposed plan against the rules. Every problem is reported; an empty list means allowed. */
export function checkBossPlan(bank: BossBank, rounds: readonly ProposedRound[]): BossPlanProblem[] {
  const problems = new Set<BossPlanProblem>();
  if (rounds.length < bossRules.minRounds || rounds.length > bossRules.maxRounds) problems.add('round_count');
  const known = new Map(bank.questions.map((q) => [q.id, q] as const));
  const seen = new Set<string>();
  let total = 0;
  for (const r of rounds) {
    if (!bank.competencies.some((c) => c.id === r.competencyId)) problems.add('unknown_competency');
    if (r.questionIds.length < bossRules.minQuestionsPerRound || r.questionIds.length > bossRules.maxQuestionsPerRound) problems.add('question_count');
    const eligible = new Set(eligibleQuestions(bank, r.competencyId).map((q) => q.id));
    for (const id of r.questionIds) {
      total++;
      const q = known.get(id);
      if (!q) problems.add('unknown_question');
      else if (!q.competencyIds.includes(r.competencyId)) problems.add('wrong_competency');
      else if (!eligible.has(id)) problems.add('not_eligible');
      if (seen.has(id)) problems.add('repeated_question');
      seen.add(id);
    }
  }
  if (total > bossRules.maxQuestions) problems.add('too_many_questions');
  for (const c of bank.competencies) if (!rounds.some((r) => r.competencyId === c.id)) problems.add('missing_competency');
  return [...problems];
}
