import { defaultProgressionConfig, type ProgressionConfig } from '../progression/config.ts';
import { planXpAward, type XpAwardPlan } from '../progression/xpAward.ts';

/**
 * Quests (GAME_DESIGN.md "Quest and boss rules"): built by the engine from the course itself, the
 * same way for every subject, with fixed objectives, success conditions and XP. Progress comes only
 * from the player's real records; the AI may tell a quest's story but never changes it.
 *
 * Templates:
 * - learn     one per curriculum objective: study its lessons and pass its Apprentice checks;
 * - deepen    one per objective and higher stage: pass its Competent / Proficient checks, open once
 *             the skills are at the stage below;
 * - prepare   every skill at Apprentice / Competent / Proficient (the boss gates, Part B);
 * - review    clear weak spots from the Weakness Bank (1, 3, 6, 10 cleared);
 * - retention pass spaced reviews when they are due (1, 3, 6, 10 passed).
 *
 * Keys are derived from the course structure, so the same quest always has the same key and its XP
 * (`quest_completed:<campaign>/<key>`) can be paid only once.
 */

export const questKinds = ['learn', 'deepen', 'prepare', 'review', 'retention'] as const;
export type QuestKind = (typeof questKinds)[number];

export const questConfig = {
  /** Cumulative milestones for the review and retention quests. */
  milestones: [1, 3, 6, 10],
  /** Stages the prepare and deepen quests cover (the boss gates). */
  gateStages: [2, 3, 4],
} as const;

export const stageNames: Readonly<Record<number, string>> = { 1: 'Novice', 2: 'Apprentice', 3: 'Competent', 4: 'Proficient', 5: 'Advanced', 6: 'Expert' };

export interface CourseActivity {
  readonly id: string;
  readonly kind: 'lesson' | 'assessment';
  readonly title: string;
  readonly targetStage: number | null;
  readonly competencyIds: readonly string[];
}

export interface CourseObjective {
  readonly id: string;
  /** The objective's own key (unique in its course). */
  readonly key: string;
  /** The learning objective, as a sentence ("Describe the rivers…"). */
  readonly title: string;
  readonly topic: string;
  readonly activities: readonly CourseActivity[];
}

export interface QuestCourse {
  readonly campaignId: string;
  readonly competencies: readonly { readonly id: string; readonly name: string }[];
  readonly objectives: readonly CourseObjective[];
}

export interface QuestRecords {
  readonly completedLessonIds: ReadonlySet<string>;
  /** Checks with at least one counted, passed attempt. */
  readonly passedCheckIds: ReadonlySet<string>;
  readonly resolvedWeaknesses: number;
  readonly openWeaknesses: number;
  readonly reviewsPassed: number;
  /** Competency id → current mastery stage (missing = 1). */
  readonly stages: ReadonlyMap<string, number>;
  readonly completedQuestKeys: ReadonlySet<string>;
}

export type ObjectiveLink =
  | { readonly kind: 'lesson'; readonly activityId: string }
  | { readonly kind: 'check'; readonly activityId: string }
  | { readonly kind: 'weaknesses' }
  | { readonly kind: 'campaign' };

export interface QuestObjective {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  readonly link: ObjectiveLink;
}

export type QuestStatus = 'locked' | 'active' | 'ready' | 'completed';

export interface Quest {
  readonly key: string;
  readonly kind: QuestKind;
  readonly title: string;
  /** The game's own description: shown when there is no story, and given to the Game Master. */
  readonly summary: string;
  readonly competencyIds: readonly string[];
  readonly difficulty: 1 | 2 | 3;
  readonly objectives: readonly QuestObjective[];
  readonly hints: readonly string[];
  readonly xp: number;
  readonly status: QuestStatus;
  /** Why a locked quest is locked. */
  readonly lockedReason: string | null;
}

const stageOf = (r: QuestRecords, id: string) => r.stages.get(id) ?? 1;
const difficultyFor = (stage: number): 1 | 2 | 3 => (stage <= 2 ? 1 : stage === 3 ? 2 : 3);
const unique = (xs: readonly string[]) => [...new Set(xs)];

function finish(q: Omit<Quest, 'status' | 'lockedReason' | 'xp'>, r: QuestRecords, xp: number, lockedReason: string | null = null): Quest {
  const status: QuestStatus = r.completedQuestKeys.has(q.key) ? 'completed' : lockedReason ? 'locked' : q.objectives.every((o) => o.done) ? 'ready' : 'active';
  return { ...q, xp, status, lockedReason: status === 'completed' ? null : lockedReason };
}

/** Every quest the course offers this player now, in order: learning first, then the gates, then upkeep. */
export function buildQuests(course: QuestCourse, r: QuestRecords, config: ProgressionConfig = defaultProgressionConfig): Quest[] {
  const xp = config.baseXp.quest_completed;
  const names = new Map(course.competencies.map((c) => [c.id, c.name] as const));
  const quests: Quest[] = [];

  for (const o of course.objectives) {
    // Quests are named after the objective's first lesson (or check); the objective is their goal.
    const name = o.activities.find((a) => a.kind === 'lesson')?.title ?? o.topic;
    const lessons = o.activities.filter((a) => a.kind === 'lesson');
    const firstChecks = o.activities.filter((a) => a.kind === 'assessment' && a.targetStage === 2);
    if (lessons.length > 0 || firstChecks.length > 0) {
      const objectives: QuestObjective[] = [
        ...lessons.map((a) => ({ id: a.id, label: `Study “${a.title}”`, done: r.completedLessonIds.has(a.id), link: { kind: 'lesson', activityId: a.id } as const })),
        ...firstChecks.map((a) => ({ id: a.id, label: `Pass “${a.title}”`, done: r.passedCheckIds.has(a.id), link: { kind: 'check', activityId: a.id } as const })),
      ];
      quests.push(finish({
        key: `learn-${o.key}`,
        kind: 'learn',
        title: name,
        summary: `${o.topic}. Study the ${lessons.length === 1 ? 'lesson' : 'lessons'}${firstChecks.length ? ', then pass the check' : ''}. Goal: ${o.title}`,
        competencyIds: unique(o.activities.flatMap((a) => a.competencyIds)),
        difficulty: 1,
        objectives,
        hints: ['Read each lesson fully before the check; the Tutor can answer questions about it.', 'A check passes at 80%. You can try again if you miss it.'],
      }, r, xp));
    }

    for (const stage of [3, 4]) {
      const checks = o.activities.filter((a) => a.kind === 'assessment' && a.targetStage === stage);
      if (checks.length === 0) continue;
      const comps = unique(checks.flatMap((a) => a.competencyIds));
      const behind = comps.filter((id) => stageOf(r, id) < stage - 1);
      quests.push(finish({
        key: `deepen-${o.key}-${stage}`,
        kind: 'deepen',
        title: `${name}: ${stageNames[stage]}`,
        summary: `${o.topic}. Pass the harder ${checks.length === 1 ? 'check' : 'checks'} to show ${stageNames[stage]}-level understanding. Goal: ${o.title}`,
        competencyIds: comps,
        difficulty: difficultyFor(stage),
        objectives: checks.map((a) => ({ id: a.id, label: `Pass “${a.title}”`, done: r.passedCheckIds.has(a.id), link: { kind: 'check', activityId: a.id } as const })),
        hints: ['Harder checks ask about causes and connections, not just facts. Review the Codex entries first.'],
      }, r, xp, behind.length > 0 ? `Opens when ${behind.map((id) => names.get(id) ?? id).join(', ')} ${behind.length === 1 ? 'reaches' : 'reach'} ${stageNames[stage - 1]}.` : null));
    }
  }

  // The gates: every skill the course can test at a stage. Each opens once the previous one is
  // complete. Skills with no check for that stage yet (no lessons written) are left out.
  const checks = course.objectives.flatMap((o) => o.activities.filter((a) => a.kind === 'assessment'));
  const testable = (stage: number) => course.competencies.filter((c) => checks.some((a) => a.targetStage === stage && a.competencyIds.includes(c.id)));
  {
    let previousDone = true;
    for (const stage of questConfig.gateStages) {
      const comps = testable(stage);
      if (comps.length === 0) break;
      const key = `prepare-${stage}`;
      const q = finish({
        key,
        kind: 'prepare',
        title: `Every skill at ${stageNames[stage]}`,
        summary: `Bring every skill this course can test to ${stageNames[stage]}. This prepares you for the ${stageNames[stage]} boss.`,
        competencyIds: comps.map((c) => c.id),
        difficulty: difficultyFor(stage),
        objectives: comps.map((c) => ({ id: c.id, label: `${c.name} at ${stageNames[stage]}`, done: stageOf(r, c.id) >= stage, link: { kind: 'campaign' } as const })),
        hints: ['A skill rises one stage when you pass a check for the next stage on two different days.'],
      }, r, xp, previousDone ? null : `Opens after “Every skill at ${stageNames[stage - 1]}”.`);
      // Only the next gate is shown; later ones appear as earlier ones are completed.
      if (q.status !== 'locked') quests.push(q);
      previousDone = q.status === 'completed';
      if (!previousDone) break;
    }
  }

  // Upkeep: cumulative milestones. Completed ones and the next one are shown.
  const upkeep = (kind: 'review' | 'retention', count: number, title: (n: number) => string, summary: (n: number) => string, hint: string, link: ObjectiveLink) => {
    for (const n of questConfig.milestones) {
      const key = `${kind}-${n}`;
      const q = finish({
        key, kind, title: title(n), summary: summary(n), competencyIds: [], difficulty: 1,
        objectives: [{ id: key, label: `${Math.min(count, n)} of ${n}`, done: count >= n, link }],
        hints: [hint],
      }, r, xp);
      quests.push(q);
      if (q.status !== 'completed') break;
    }
  };
  if (r.resolvedWeaknesses > 0 || r.openWeaknesses > 0) {
    upkeep('review', r.resolvedWeaknesses, (n) => (n === 1 ? 'Mend a weak spot' : `Mend ${n} weak spots`),
      (n) => `Clear ${n === 1 ? 'a weak spot' : `${n} weak spots`} from your Weakness Bank. A weak spot clears after three correct answers given when its review is due.`,
      'Weak spots come back for review about 1, 3 and 7 days after a mistake.', { kind: 'weaknesses' });
  }
  if (r.reviewsPassed > 0 || course.competencies.some((c) => stageOf(r, c.id) >= 2)) {
    upkeep('retention', r.reviewsPassed, (n) => (n === 1 ? 'Keep it fresh' : `Keep it fresh: ${n} reviews`),
      (n) => `Pass ${n === 1 ? 'a spaced review' : `${n} spaced reviews`} when ${n === 1 ? 'it is' : 'they are'} due, so what you learned stays with you.`,
      'Your dashboard’s “Next steps” shows reviews when they fall due.', { kind: 'campaign' });
  }
  return quests;
}

/** XP plans for quests whose objectives are all met and that haven't been completed yet. */
export function questsToComplete(quests: readonly Quest[], campaignId: string, config: ProgressionConfig = defaultProgressionConfig): { key: string; xp: XpAwardPlan }[] {
  return quests
    .filter((q) => q.status === 'ready')
    .map((q) => ({ key: q.key, xp: planXpAward({ kind: 'quest_completed', sourceId: `${campaignId}/${q.key}`, campaignId }, config) }));
}
