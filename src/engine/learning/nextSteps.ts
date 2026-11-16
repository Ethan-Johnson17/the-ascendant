/**
 * The Progression Advisor's plan (GAME_DESIGN.md "AI rules"): what to study next, decided by the
 * engine from the player's real records, always available without AI. The AI may only explain this
 * plan in friendlier words; it never chooses or reorders the steps.
 *
 * Priority: retention reviews that are due, then due Weakness Bank reviews, then the next lesson,
 * then the next check that moves a competency forward. At most `max` steps, no activity twice.
 */

export type NextStepKind = 'review' | 'weakness' | 'lesson' | 'check';
export const nextStepKinds = ['review', 'weakness', 'lesson', 'check'] as const;

/** The plain-language reason the engine gives for each kind of step (also given to the AI). */
export const nextStepReasons: Readonly<Record<NextStepKind, string>> = {
  review: 'A spaced review is due: passing it now keeps this knowledge fresh and moves the next review further out.',
  weakness: 'You have missed this before and it is due for review. Three correct reviews on separate days clear it.',
  lesson: 'The next lesson in the curriculum.',
  check: 'Passing this check on two different days raises a competency to the next stage.',
};

export interface PlanLesson {
  readonly kind: 'lesson';
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface PlanCheck {
  readonly kind: 'assessment';
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly competencyIds: readonly string[];
  readonly targetStage: number;
  readonly unlocked: boolean;
  readonly reviewDue: boolean;
}

export interface PlanInput {
  /** Every lesson and check, in curriculum order. */
  readonly activities: readonly (PlanLesson | PlanCheck)[];
  readonly competencies: readonly { readonly id: string; readonly stage: number }[];
  readonly weaknesses: readonly {
    readonly conceptTitle: string;
    readonly status: 'open' | 'resolved';
    readonly due: boolean;
    readonly priority: number;
    readonly reviewCheck: { readonly id: string } | null;
  }[];
}

export interface NextStep {
  readonly kind: NextStepKind;
  readonly activityId: string;
  readonly activityKey: string;
  readonly activityKind: 'lesson' | 'assessment';
  readonly title: string;
  /** For weakness steps, the concept to review. */
  readonly concept?: string;
  readonly reason: string;
}

export function planNextSteps(input: PlanInput, max = 3): NextStep[] {
  const steps: NextStep[] = [];
  const used = new Set<string>();
  const byId = new Map(input.activities.map((a) => [a.id, a] as const));
  const stageOf = new Map(input.competencies.map((c) => [c.id, c.stage] as const));
  const add = (kind: NextStepKind, a: PlanLesson | PlanCheck, concept?: string) => {
    if (steps.length >= max || used.has(a.id)) return;
    used.add(a.id);
    steps.push({ kind, activityId: a.id, activityKey: a.key, activityKind: a.kind, title: a.title, ...(concept ? { concept } : {}), reason: nextStepReasons[kind] });
  };
  const checks = input.activities.filter((a): a is PlanCheck => a.kind === 'assessment');

  // 1. Retention reviews that are due: the lowest-stage unlocked check covering that competency.
  for (const c of [...checks].filter((c) => c.reviewDue && c.unlocked).sort((a, b) => a.targetStage - b.targetStage)) add('review', c);

  // 2. Weakness Bank reviews that are due, most urgent first.
  for (const w of [...input.weaknesses].filter((w) => w.status === 'open' && w.due && w.reviewCheck).sort((a, b) => b.priority - a.priority)) {
    const check = byId.get(w.reviewCheck!.id);
    if (check) add('weakness', check, w.conceptTitle);
  }

  // 3. The next lesson not yet completed.
  const lesson = input.activities.find((a): a is PlanLesson => a.kind === 'lesson' && !a.completed);
  if (lesson) add('lesson', lesson);

  // 4. The first unlocked check that would move one of its competencies to the next stage.
  const forward = checks.find((c) => c.unlocked && c.competencyIds.some((id) => c.targetStage === (stageOf.get(id) ?? 1) + 1));
  if (forward) add('check', forward);

  return steps;
}
