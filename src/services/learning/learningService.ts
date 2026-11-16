import { z } from 'zod';
import { attributeIds } from '../../engine/character/attributes.ts';
import type { MasteryStage } from '../../engine/character/attributeGrowth.ts';
import { defaultLearningConfig, errorCategories, type Difficulty, type LearningConfig } from '../../engine/learning/config.ts';
import { assessmentItemSchema, type AssessmentItem } from '../../engine/learning/curriculum.ts';
import { answerSchema, needsExaminer, publicItem } from '../../engine/learning/grading.ts';
import { retentionStrength } from '../../engine/learning/retention.ts';
import { planAttempt, planLessonCompletion, resolveSubmission, type CompetencyContext } from '../../engine/learning/session.ts';
import type { WeaknessState } from '../../engine/learning/weakness.ts';
import type { Examiner, ExaminerMarking } from '../ai/examinerService.ts';

/**
 * The server side of learning: what the `learning` Edge Function runs for each request.
 *
 *   1. load context from the database   (service-role SQL functions, learning_*_context)
 *   2. let the game engine decide         (src/engine/learning/session.ts)
 *   3. record the decision atomically      (learning_record_* / learning_create_attempt)
 *
 * The database re-checks the rules that matter most (one stage at a time, no XP for failures,
 * immutable submissions), so a bug here cannot corrupt progress. Runs unchanged in Node (tests,
 * against PGlite) and Deno (Edge Function, against Supabase).
 */

/** Calls one of the database's learning functions with named arguments. */
export interface LearningStore {
  call(fn: string, args: Record<string, unknown>): Promise<unknown>;
}

export class StoreError extends Error {
  constructor(message: string, readonly code: string | undefined) {
    super(message);
  }
}

export const learningRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start_check'), campaignId: z.uuid(), activityId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('submit_check'), attemptId: z.uuid(), answers: z.record(z.string().max(200), answerSchema) }),
  z.object({ action: z.literal('complete_lesson'), campaignId: z.uuid(), activityId: z.string().min(1).max(200) }),
]);
export type LearningRequest = z.infer<typeof learningRequestSchema>;

export interface LearningResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

// ───────────────────────────────────────────── Context parsing (never trust shapes, even our own)

const date = z.string().transform((s) => new Date(s));
const stage = z.number().int().min(1).max(6).transform((n) => n as MasteryStage);

const competencyRow = z.object({
  competencyId: z.string(),
  stage,
  reviewStep: z.number().int().nullable(),
  nextReviewAt: date.nullable(),
  needsReview: z.boolean(),
  lastDemonstratedAt: date.nullable(),
  lastDifficulty: z.number().int().min(1).max(3).nullable(),
  passTimesForNext: z.array(date),
  recentResults: z.array(z.boolean()),
  openWeaknesses: z.number().int(),
});

const itemRow = z.object({ id: z.string(), conceptId: z.string(), definition: z.record(z.string(), z.unknown()) });

const weaknessRow = z.object({
  concept_id: z.string(),
  status: z.enum(['open', 'resolved']),
  error_category: z.enum(errorCategories),
  occurrence_count: z.number().int(),
  correct_reviews: z.number().int(),
  next_review_at: date.nullable(),
  last_mistake_at: date,
  last_successful_review: date.nullable(),
  resolved_at: date.nullable(),
  incorrect_responses: z.array(answerSchema),
});

const startContextSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  preference: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  activity: z.object({ id: z.string(), targetStage: z.number().int(), questionCount: z.number().int(), writtenCount: z.number().int().default(0), competencyIds: z.array(z.string()) }),
  items: z.array(itemRow),
  competencies: z.array(competencyRow),
  weakConceptIds: z.array(z.string()),
  recentAttempts: z.number().int(),
});

const submitContextSchema = z.object({
  campaignId: z.string(),
  attempt: z.object({ id: z.string(), submitted: z.boolean(), difficulty: z.number().int().min(1).max(3) }),
  activity: z.object({ id: z.string(), targetStage: z.number().int(), competencyIds: z.array(z.string()) }),
  items: z.array(itemRow),
  competencies: z.array(competencyRow),
  weaknesses: z.array(weaknessRow),
  standings: z.array(z.object({ competencyId: z.string(), attribute: z.enum(attributeIds), stage })),
});

const lessonContextSchema = z.object({ campaignStatus: z.string(), lessonId: z.string(), alreadyCompleted: z.boolean() });
const paidSchema = z.object({ xpPaid: z.array(z.string()) });

/** Stored definitions use short keys; the engine works with database ids. */
function toItem(row: z.infer<typeof itemRow>): AssessmentItem {
  return { ...assessmentItemSchema.parse(row.definition), key: row.id, concept: row.conceptId };
}

function toCompetency(row: z.infer<typeof competencyRow>): CompetencyContext {
  return {
    competencyId: row.competencyId,
    stage: row.stage,
    retention: { step: row.reviewStep, nextReviewAt: row.nextReviewAt, needsReview: row.needsReview, lastDemonstratedAt: row.lastDemonstratedAt },
    passTimesForNext: row.passTimesForNext,
    recentResults: row.recentResults,
    openWeaknesses: row.openWeaknesses,
    lastDifficulty: row.lastDifficulty as Difficulty | null,
  };
}

function toWeakness(row: z.infer<typeof weaknessRow>): WeaknessState {
  return {
    concept: row.concept_id,
    status: row.status,
    errorCategory: row.error_category,
    occurrenceCount: row.occurrence_count,
    correctReviews: row.correct_reviews,
    nextReviewAt: row.next_review_at,
    lastMistakeAt: row.last_mistake_at,
    lastSuccessfulReview: row.last_successful_review,
    resolvedAt: row.resolved_at,
    incorrectResponses: row.incorrect_responses,
  };
}

/** The correct answer, for showing after marking. */
function answerOf(item: AssessmentItem): unknown {
  return item.kind === 'written' ? item.modelAnswer : item.answer;
}

/** What the player sees of the Examiner's marking, after submitting (rubric included). */
function writtenDetails(item: AssessmentItem, marking: ExaminerMarking | null, points: { earned: number; required: number; total: number } | undefined) {
  if (item.kind !== 'written') return undefined;
  const judged = marking?.items[item.key];
  return {
    criteria: item.criteria.map((c) => {
      const j = judged?.criteria.find((x) => x.key === c.key);
      return { key: c.key, description: c.description, points: c.points, met: j?.met ?? false, quote: j?.quote ?? '' };
    }),
    earned: points?.earned ?? 0,
    required: points?.required ?? item.passPoints,
    total: points?.total ?? item.criteria.reduce((n, c) => n + c.points, 0),
    feedback: judged?.feedback ?? null,
    confident: judged ? judged.mark.confident : true,
    marked: !!judged,
  };
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const refusalStatus = { not_found: 404, locked: 403, campaign_inactive: 409, already_submitted: 409, invalid: 422, examiner_unavailable: 503 } as const;

export interface LearningServiceOptions {
  readonly config?: LearningConfig;
  readonly now?: () => Date;
  /** Checks a player may start per hour (abuse limit). */
  readonly maxAttemptsPerHour?: number;
  /** Marks written answers. Without it, written questions are left out (or their check waits). */
  readonly examiner?: Examiner | null;
}

export function createLearningService(store: LearningStore, options: LearningServiceOptions = {}) {
  const config = options.config ?? defaultLearningConfig;
  const now = options.now ?? (() => new Date());
  const maxPerHour = options.maxAttemptsPerHour ?? 30;
  const examiner = options.examiner ?? null;

  async function startCheck(userId: string, campaignId: string, activityId: string): Promise<LearningResponse> {
    const raw = await store.call('learning_start_context', { p_user_id: userId, p_campaign_id: campaignId, p_activity_id: activityId });
    if (raw === null) return { status: 404, body: { error: 'That check was not found in this campaign.' } };
    const ctx = startContextSchema.parse(raw);
    if (ctx.recentAttempts >= maxPerHour) return { status: 429, body: { error: 'You have started a lot of checks this hour. Take a short break and try again.' } };

    const writtenAvailable = ctx.activity.writtenCount > 0 && examiner !== null && (await examiner.available(userId, ctx.activity.writtenCount));
    const at = now();
    const plan = planAttempt(
      {
        campaignStatus: ctx.campaignStatus,
        activity: ctx.activity,
        writtenAvailable,
        items: ctx.items.map(toItem),
        competencies: ctx.competencies.map(toCompetency),
        preference: ctx.preference,
        weakConcepts: new Set(ctx.weakConceptIds),
      },
      `${userId}:${activityId}:${at.toISOString()}`,
      config,
    );
    if (!plan.ok) return { status: refusalStatus[plan.code], body: { error: plan.message, code: plan.code } };

    const issued = plan.items.map(publicItem);
    const created = z.object({ attemptId: z.string(), startedAt: z.string() }).parse(
      await store.call('learning_create_attempt', {
        p_user_id: userId,
        p_campaign_id: campaignId,
        p_activity_id: activityId,
        p_item_ids: plan.items.map((i) => i.key),
        p_difficulty: plan.difficulty,
        p_issued_items: issued,
      }),
    );
    return { status: 200, body: { attemptId: created.attemptId, startedAt: created.startedAt, difficulty: plan.difficulty, items: issued } };
  }

  async function submitCheck(userId: string, attemptId: string, answers: Record<string, z.infer<typeof answerSchema>>): Promise<LearningResponse> {
    const raw = await store.call('learning_submit_context', { p_user_id: userId, p_attempt_id: attemptId });
    if (raw === null) return { status: 404, body: { error: 'That check was not found.' } };
    const ctx = submitContextSchema.parse(raw);
    const items = ctx.items.map(toItem);
    if (ctx.attempt.submitted) return { status: 409, body: { error: 'This check has already been submitted.', code: 'already_submitted' } };

    // Written answers go to the Examiner first. If it can't mark them, nothing is recorded and the
    // player can submit the same answers again.
    const jobs = items.flatMap((i) => (i.kind === 'written' && needsExaminer(i, answers[i.key]) ? [{ item: i, answer: answers[i.key] as string }] : []));
    let marking: ExaminerMarking | null = null;
    if (jobs.length > 0) {
      if (!examiner) return { status: 503, body: { error: 'Written answers can’t be marked right now: the Examiner isn’t available.', code: 'examiner_unavailable' } };
      const marked = await examiner.mark(userId, ctx.campaignId, jobs);
      if (!marked.ok) return { status: marked.status, body: { error: marked.error, code: marked.code } };
      marking = marked.marking;
    }
    const marks = marking ? Object.fromEntries(Object.entries(marking.items).map(([k, j]) => [k, j.mark])) : {};

    const at = now();
    const outcome = resolveSubmission(
      {
        campaignId: ctx.campaignId,
        attempt: { id: ctx.attempt.id, submitted: ctx.attempt.submitted, difficulty: ctx.attempt.difficulty as Difficulty },
        activity: ctx.activity,
        items,
        competencies: ctx.competencies.map(toCompetency),
        weaknesses: ctx.weaknesses.map(toWeakness),
        standings: ctx.standings,
      },
      answers,
      at,
      config,
      marks,
    );
    if (!outcome.ok) return { status: refusalStatus[outcome.code], body: { error: outcome.message, code: outcome.code } };

    const byId = new Map(items.map((i) => [i.key, i] as const));
    const results = outcome.grade.results.map((r) => ({
      itemId: r.itemKey,
      conceptId: r.concept,
      correct: r.correct,
      errorCategory: r.errorCategory ?? null,
      given: r.given,
      answer: answerOf(byId.get(r.itemKey)!),
      explanation: byId.get(r.itemKey)!.explanation,
      ...(r.points ? { written: writtenDetails(byId.get(r.itemKey)!, marking, r.points) } : {}),
    }));
    // Stored with the attempt for audit: the checked judgement, never the prompt.
    const markingRecord = marking
      ? {
          origin: marking.origin,
          provider: marking.provider,
          model: marking.model,
          items: Object.fromEntries(
            Object.entries(marking.items).map(([k, j]) => [k, { criteria: j.criteria, confidence: j.confidence, confident: j.mark.confident, feedback: j.feedback, problems: j.problems }]),
          ),
        }
      : null;
    const counted = outcome.counted;
    const recorded = paidSchema.parse(
      await store.call('learning_record_submission', {
        p_user_id: userId,
        p_attempt_id: attemptId,
        p_outcome: {
          submittedAt: at.toISOString(),
          answers: Object.fromEntries(items.map((i) => [i.key, answers[i.key] ?? null])),
          results,
          correct: outcome.grade.correct,
          total: outcome.grade.total,
          score: outcome.grade.score,
          passed: outcome.grade.passed,
          counted,
          marking: markingRecord,
          competencies: (counted ? outcome.competencies : []).map((c) => ({
            competencyId: c.competencyId,
            stage: c.mastery.stage,
            evidence: c.evidence,
            reviewStep: c.retention.step,
            nextReviewAt: iso(c.retention.nextReviewAt),
            needsReview: c.retention.needsReview,
            lastDemonstratedAt: iso(c.retention.lastDemonstratedAt),
            retentionStrength: retentionStrength(c.retention, config),
          })),
          weaknesses: (counted ? outcome.weaknesses : []).map(({ state: w }) => ({
            conceptId: w.concept,
            status: w.status,
            errorCategory: w.errorCategory,
            occurrenceCount: w.occurrenceCount,
            correctReviews: w.correctReviews,
            nextReviewAt: iso(w.nextReviewAt),
            lastMistakeAt: iso(w.lastMistakeAt),
            lastSuccessfulReview: iso(w.lastSuccessfulReview),
            resolvedAt: iso(w.resolvedAt),
            incorrectResponses: w.incorrectResponses,
          })),
          attributes: outcome.attributes,
          xp: outcome.xp,
        },
      }),
    );
    const paid = outcome.xp.filter((x) => recorded.xpPaid.includes(x.idempotencyKey));
    return {
      status: 200,
      body: {
        correct: outcome.grade.correct,
        total: outcome.grade.total,
        score: outcome.grade.score,
        passed: outcome.grade.passed,
        counted,
        examinerOrigin: marking?.origin ?? null,
        results,
        competencies: outcome.competencies.map((c) => ({
          competencyId: c.competencyId,
          previousStage: c.previousStage,
          stage: c.mastery.stage,
          advanced: c.mastery.advanced,
          progress: { spacedPasses: c.mastery.spacedPasses, passesRequired: c.mastery.passesRequired, reason: c.mastery.reason },
          reviewedWhileDue: c.reviewedWhileDue,
        })),
        weaknesses: outcome.weaknesses.map((w) => ({ conceptId: w.state.concept, event: w.event, status: w.state.status })),
        xp: { total: paid.reduce((s, x) => s + x.amount, 0), awards: paid.map((x) => ({ kind: x.kind, amount: x.amount })) },
      },
    };
  }

  async function completeLesson(userId: string, campaignId: string, activityId: string): Promise<LearningResponse> {
    const raw = await store.call('learning_lesson_context', { p_user_id: userId, p_campaign_id: campaignId, p_activity_id: activityId });
    if (raw === null) return { status: 404, body: { error: 'That lesson was not found in this campaign.' } };
    const ctx = lessonContextSchema.parse(raw);
    const plan = planLessonCompletion({ campaignId, campaignStatus: ctx.campaignStatus, lessonId: ctx.lessonId });
    if (!plan.ok) return { status: refusalStatus[plan.code], body: { error: plan.message, code: plan.code } };
    const recorded = paidSchema.parse(
      await store.call('learning_record_lesson', { p_user_id: userId, p_campaign_id: campaignId, p_activity_id: activityId, p_xp: plan.xp }),
    );
    const paid = recorded.xpPaid.includes(plan.xp.idempotencyKey) ? plan.xp.amount : 0;
    return { status: 200, body: { completed: true, firstCompletion: !ctx.alreadyCompleted, xp: { total: paid } } };
  }

  /** Validates and dispatches one request from a signed-in player. Never throws for bad input. */
  async function handle(userId: string, body: unknown): Promise<LearningResponse> {
    const req = learningRequestSchema.safeParse(body);
    if (!req.success) return { status: 400, body: { error: 'The request was not understood.', issues: req.error.issues.map((i) => i.message) } };
    try {
      switch (req.data.action) {
        case 'start_check':
          return await startCheck(userId, req.data.campaignId, req.data.activityId);
        case 'submit_check':
          return await submitCheck(userId, req.data.attemptId, req.data.answers);
        case 'complete_lesson':
          return await completeLesson(userId, req.data.campaignId, req.data.activityId);
      }
    } catch (err) {
      if (err instanceof StoreError) {
        if (err.code === '23505') return { status: 409, body: { error: 'This check has already been submitted.' } };
        if (err.code === '42501') return { status: 403, body: { error: 'That isn’t allowed right now.' } };
      }
      if (err instanceof z.ZodError) return { status: 500, body: { error: 'The game data came back in an unexpected shape. Please try again later.' } };
      return { status: 500, body: { error: 'Something went wrong. Please try again.' } };
    }
  }

  return { handle, startCheck, submitCheck, completeLesson };
}
export type LearningService = ReturnType<typeof createLearningService>;
