import type { AttributeId, AttributeScores } from '../character/attributes.ts';
import { deriveAttributes, type MasteryStage } from '../character/attributeGrowth.ts';
import { planXpAward, type XpAwardPlan } from '../progression/xpAward.ts';
import { defaultLearningConfig, type Difficulty, type DifficultyPreference, type LearningConfig } from './config.ts';
import type { AssessmentItem } from './curriculum.ts';
import { recommendDifficulty, selectItems } from './difficulty.ts';
import { gradeAttempt, needsExaminer, type Answer, type AttemptGrade, type WrittenMark } from './grading.ts';
import { checkUnlocked, decideMastery, type MasteryDecision } from './mastery.ts';
import { applyRetentionResult, type RetentionState } from './retention.ts';
import { applyAnswerToWeakness, type WeaknessEvent, type WeaknessState } from './weakness.ts';

/**
 * One learning action, decided end to end by the engine: which questions a check issues, and what
 * a submission changes (mastery, retention, Weakness Bank, attributes, XP). The caller loads the
 * context, and records the outcome exactly as returned; nothing here touches a database.
 *
 * "AI proposes, engine decides, database records" — in Phase 3 there is no AI yet; answers are
 * marked against stored keys.
 */

export interface CompetencyContext {
  readonly competencyId: string;
  readonly stage: MasteryStage;
  readonly retention: RetentionState;
  /** Recorded passes of checks targeting `stage + 1` for this competency (before this attempt). */
  readonly passTimesForNext: readonly Date[];
  readonly recentResults: readonly boolean[];
  readonly openWeaknesses: number;
  readonly lastDifficulty: Difficulty | null;
  /** A practical project has already counted for this competency (it counts only once). */
  readonly projectPassed?: boolean;
}

export type Refusal = {
  ok: false;
  code: 'not_found' | 'locked' | 'campaign_inactive' | 'already_submitted' | 'invalid' | 'examiner_unavailable';
  message: string;
};

// ───────────────────────────────────────────────────────── Starting a check

export interface StartContext {
  readonly campaignStatus: 'active' | 'paused' | 'completed';
  readonly activity: { readonly id: string; readonly targetStage: number; readonly questionCount: number; readonly writtenCount: number };
  /** Every question in the check's pool, keyed by database id in `item.key`. */
  readonly items: readonly AssessmentItem[];
  readonly competencies: readonly CompetencyContext[];
  readonly preference: DifficultyPreference;
  readonly weakConcepts: ReadonlySet<string>;
  /** The Examiner can mark this many written answers for the player right now. */
  readonly writtenAvailable: boolean;
}

export type AttemptPlan = { ok: true; difficulty: Difficulty; items: readonly AssessmentItem[] } | Refusal;

export function planAttempt(ctx: StartContext, seed: string, config: LearningConfig = defaultLearningConfig): AttemptPlan {
  if (ctx.campaignStatus !== 'active') {
    return { ok: false, code: 'campaign_inactive', message: 'Resume this campaign to take its checks.' };
  }
  if (ctx.competencies.length === 0) return { ok: false, code: 'invalid', message: 'This check is not linked to any competency.' };
  const locked = ctx.competencies.find((c) => !checkUnlocked(c.stage, ctx.activity.targetStage));
  if (locked) return { ok: false, code: 'locked', message: 'Reach the previous mastery stage before taking this check.' };
  // Without the Examiner, written questions are left out of checks that work without them
  // (up to Proficient); checks made only of written questions wait (GAME_DESIGN.md "AI rules").
  let writtenCount = ctx.activity.writtenCount;
  if (writtenCount > 0 && !ctx.writtenAvailable) {
    if (writtenCount >= ctx.activity.questionCount) {
      return { ok: false, code: 'examiner_unavailable', message: 'This check is made of written questions, and the Examiner isn’t available right now. Please try again later.' };
    }
    writtenCount = 0;
  }
  const written = ctx.items.filter((i) => i.kind === 'written');
  const others = ctx.items.filter((i) => i.kind !== 'written');
  const otherCount = ctx.activity.questionCount - writtenCount;
  if (written.length < writtenCount || others.length < otherCount) return { ok: false, code: 'invalid', message: 'This check does not have enough questions.' };

  // Difficulty follows the weakest competency the check covers.
  const difficulty = Math.min(
    ...ctx.competencies.map((c) =>
      recommendDifficulty({ recentResults: c.recentResults, openWeaknesses: c.openWeaknesses, preference: ctx.preference, lastDifficulty: c.lastDifficulty }, config),
    ),
  ) as Difficulty;
  // Written questions come last, after the quicker ones.
  const items = [
    ...(otherCount > 0 ? selectItems(others, otherCount, difficulty, seed, ctx.weakConcepts) : []),
    ...(writtenCount > 0 ? selectItems(written, writtenCount, difficulty, `${seed}:written`, ctx.weakConcepts) : []),
  ];
  return { ok: true, difficulty, items };
}

// ───────────────────────────────────────────────────────── Submitting a check

export interface SubmitContext {
  readonly campaignId: string;
  readonly attempt: { readonly id: string; readonly submitted: boolean; readonly difficulty: Difficulty };
  readonly activity: { readonly id: string; readonly targetStage: number; readonly isProject?: boolean };
  /** The questions issued for this attempt, with answer keys. */
  readonly items: readonly AssessmentItem[];
  readonly competencies: readonly CompetencyContext[];
  /** Existing Weakness Bank records for the issued questions' concepts (open or resolved). */
  readonly weaknesses: readonly WeaknessState[];
  /** Every competency the player holds across all campaigns, for re-deriving attributes. */
  readonly standings: readonly { readonly competencyId: string; readonly attribute: AttributeId; readonly stage: MasteryStage }[];
}

export interface CompetencyOutcome {
  readonly competencyId: string;
  readonly previousStage: MasteryStage;
  readonly mastery: MasteryDecision;
  readonly retention: RetentionState;
  /** This attempt counts as evidence for the competency (a pass of an unlocked check). */
  readonly evidence: boolean;
  readonly reviewedWhileDue: boolean;
}

export interface WeaknessOutcome {
  readonly state: WeaknessState;
  readonly event: WeaknessEvent;
}

export interface SubmissionOutcome {
  readonly ok: true;
  /**
   * False when a written answer could not be marked confidently. Such an attempt is recorded, but
   * changes nothing: no pass, fail, XP, retention or Weakness Bank update.
   */
  readonly counted: boolean;
  readonly grade: AttemptGrade;
  readonly competencies: readonly CompetencyOutcome[];
  readonly weaknesses: readonly WeaknessOutcome[];
  readonly attributes: AttributeScores;
  readonly xp: readonly XpAwardPlan[];
}

export function resolveSubmission(
  ctx: SubmitContext,
  answers: Readonly<Record<string, Answer>>,
  now: Date,
  config: LearningConfig = defaultLearningConfig,
  /** The Examiner's checked marks for written answers, by item key. */
  marks: Readonly<Record<string, WrittenMark>> = {},
): SubmissionOutcome | Refusal {
  if (ctx.attempt.submitted) return { ok: false, code: 'already_submitted', message: 'This check has already been submitted.' };
  if (ctx.items.length === 0) return { ok: false, code: 'invalid', message: 'This attempt has no questions.' };

  const missing = ctx.items.find((i) => needsExaminer(i, answers[i.key]) && !marks[i.key]);
  if (missing) return { ok: false, code: 'examiner_unavailable', message: 'A written answer has not been marked yet. Please try submitting again.' };

  const grade = gradeAttempt(ctx.items, answers, config.mastery.passMark, marks);
  const standingAttributes = () => deriveAttributes(ctx.standings.map((s) => ({ attribute: s.attribute, masteryStage: s.stage })));

  if (!grade.confident) {
    const competencies = ctx.competencies.map<CompetencyOutcome>((c) => ({
      competencyId: c.competencyId,
      previousStage: c.stage,
      mastery: { stage: c.stage, advanced: false, spacedPasses: 0, passesRequired: config.mastery.passesRequired, reason: 'This attempt didn’t count, so nothing changed.' },
      retention: c.retention,
      evidence: false,
      reviewedWhileDue: false,
    }));
    return { ok: true, counted: false, grade, competencies, weaknesses: [], attributes: standingAttributes(), xp: [] };
  }

  // Written work can carry a competency further than self-marked questions.
  const cap = ctx.items.some((i) => i.kind === 'written') ? config.mastery.maxStageFromWritten : config.mastery.maxStageFromChecks;
  const competencies: CompetencyOutcome[] = ctx.competencies.map((c) => {
    const evidence = grade.passed && checkUnlocked(c.stage, ctx.activity.targetStage);
    // Only a pass of the next stage's check moves the stage; easier checks still count for retention.
    // A practical project counts as one pass, once per competency; the other must come from a check.
    const countsForNext = evidence && ctx.activity.targetStage === c.stage + 1 && !(ctx.activity.isProject && c.projectPassed);
    const mastery = decideMastery(c.stage, countsForNext ? [...c.passTimesForNext, now] : c.passTimesForNext, config, cap);
    const retention = applyRetentionResult(c.retention, grade.passed, now, config);
    return { competencyId: c.competencyId, previousStage: c.stage, mastery, retention: retention.state, evidence, reviewedWhileDue: retention.wasDueReview };
  });

  // Weakness Bank: one update per concept, applying that concept's answers in order.
  const byConcept = new Map(ctx.weaknesses.map((w) => [w.concept, w] as const));
  const touched = new Map<string, WeaknessOutcome>();
  for (const r of grade.results) {
    const prior = touched.get(r.concept)?.state ?? byConcept.get(r.concept) ?? null;
    const update = applyAnswerToWeakness(prior, r, now, config);
    if (update.state && update.event !== 'none' && update.event !== 'not_due') {
      touched.set(r.concept, { state: update.state, event: update.event });
    }
  }

  const stageById = new Map(competencies.map((c) => [c.competencyId, c.mastery.stage] as const));
  const attributes = deriveAttributes(ctx.standings.map((s) => ({ attribute: s.attribute, masteryStage: stageById.get(s.competencyId) ?? s.stage })));

  const xp: XpAwardPlan[] = [];
  if (grade.passed) xp.push(planXpAward({ kind: ctx.activity.isProject ? 'practical_project_completed' : 'knowledge_check_passed', sourceId: ctx.activity.id, campaignId: ctx.campaignId }));
  // Projects are not retention reviews: they pay the project reward only.
  for (const c of ctx.activity.isProject ? [] : ctx.competencies) {
    const outcome = competencies.find((o) => o.competencyId === c.competencyId);
    if (grade.passed && outcome?.reviewedWhileDue && c.retention.nextReviewAt) {
      // One reward per scheduled review: the review is identified by when it fell due.
      xp.push(planXpAward({ kind: 'retention_review_passed', sourceId: `${c.competencyId}@${c.retention.nextReviewAt.toISOString()}`, campaignId: ctx.campaignId }));
    }
  }

  return { ok: true, counted: true, grade, competencies, weaknesses: [...touched.values()], attributes, xp };
}

// ───────────────────────────────────────────────────────── Completing a lesson

export function planLessonCompletion(ctx: { campaignId: string; campaignStatus: string; lessonId: string }): { ok: true; xp: XpAwardPlan } | Refusal {
  if (ctx.campaignStatus !== 'active') return { ok: false, code: 'campaign_inactive', message: 'Resume this campaign to continue its lessons.' };
  return { ok: true, xp: planXpAward({ kind: 'lesson_completed', sourceId: ctx.lessonId, campaignId: ctx.campaignId }) };
}
