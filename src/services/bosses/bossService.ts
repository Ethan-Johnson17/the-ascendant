import { z } from 'zod';
import { errorCategories } from '../../engine/learning/config.ts';
import { assessmentItemSchema, type AssessmentItem } from '../../engine/learning/curriculum.ts';
import { answerSchema, publicItem, type Answer } from '../../engine/learning/grading.ts';
import type { WeaknessState } from '../../engine/learning/weakness.ts';
import { checkBossPlan } from '../../engine/encounters/bossPlan.ts';
import {
  bossBank, bossConfig, bossQuestionIds, bossStages, bossStatus, gameBossPlan, resolveBossAnswer, type BossCourse, type BossRecords, type BossStatus,
} from '../../engine/encounters/boss.ts';
import type { BossContext, BossPlan } from '../ai/roles/strategist.ts';
import type { LearningStore } from '../learning/learningService.ts';

/**
 * Server side of boss battles (runs in the `learning` Edge Function). The engine decides; this
 * file loads context, asks the Strategist (AI) for a plan when one is available, and records.
 */

const date = z.string().transform((s) => new Date(s));

export const bossContextRowSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  campaignTitle: z.string(),
  campaignDescription: z.string(),
  unbuiltLessons: z.number().int(),
  competencies: z.array(z.object({ id: z.string(), name: z.string() })),
  checks: z.array(z.object({ id: z.string(), title: z.string(), targetStage: z.number().int(), competencyIds: z.array(z.string()) })),
  questions: z.array(z.object({
    id: z.string(), activityId: z.string(), activityStage: z.number().int(), conceptId: z.string(), concept: z.string(),
    competencyIds: z.array(z.string()), difficulty: z.number().int(), kind: z.string(), prompt: z.string(),
  })),
  stages: z.array(z.object({ competencyId: z.string(), stage: z.number().int() })),
  encounters: z.array(z.object({
    id: z.string(), stage: z.number().int(), status: z.enum(['active', 'won', 'lost']), startedAt: date, endedAt: date.nullable(), missedConceptIds: z.array(z.string()),
  })),
  checkPasses: z.array(z.object({ activityId: z.string(), at: date })),
});
type BossContextRow = z.infer<typeof bossContextRowSchema>;

export const toBossCourse = (c: BossContextRow): BossCourse => ({ competencies: c.competencies, checks: c.checks, questions: c.questions, unbuiltLessons: c.unbuiltLessons });
export const toBossRecords = (c: BossContextRow): BossRecords => ({
  stages: new Map(c.stages.map((s) => [s.competencyId, s.stage] as const)),
  encounters: c.encounters,
  checkPasses: c.checkPasses,
});

export async function loadBossContext(store: LearningStore, userId: string, campaignId: string): Promise<BossContextRow | null> {
  const raw = await store.call('boss_context', { p_user_id: userId, p_campaign_id: campaignId });
  return raw === null ? null : bossContextRowSchema.parse(raw);
}

const planSchema = z.object({
  name: z.string(), epithet: z.string(), intro: z.array(z.string()),
  rounds: z.array(z.object({ competencyId: z.string(), competencyName: z.string(), title: z.string(), narration: z.string().nullable(), questionIds: z.array(z.string()) })),
  victory: z.string(), defeat: z.string(), removed: z.number().int(),
});

const answerContextSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  encounter: z.object({
    id: z.string(), campaignId: z.string(), stage: z.number().int(), status: z.enum(['active', 'won', 'lost']), resolve: z.number().int(), maxResolve: z.number().int(),
    position: z.number().int(), questionIds: z.array(z.string()), plan: planSchema, planOrigin: z.enum(['ai', 'fixture', 'game']),
    answers: z.array(z.object({ itemId: z.string(), conceptId: z.string(), correct: z.boolean(), given: answerSchema.nullable() })),
    endedAt: z.string().nullable(),
  }),
  item: z.object({ id: z.string(), conceptId: z.string(), definition: z.record(z.string(), z.unknown()) }).nullable(),
  weakness: z.object({
    concept_id: z.string(), status: z.enum(['open', 'resolved']), error_category: z.enum(errorCategories), occurrence_count: z.number().int(),
    correct_reviews: z.number().int(), next_review_at: date.nullable(), last_mistake_at: date, last_successful_review: date.nullable(),
    resolved_at: date.nullable(), incorrect_responses: z.array(answerSchema),
  }).nullable(),
});

const toItem = (row: { id: string; conceptId: string; definition: Record<string, unknown> }): AssessmentItem => ({ ...assessmentItemSchema.parse(row.definition), key: row.id, concept: row.conceptId });
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Proposes a plan with the Strategist (AI). Null when no AI is available: the game makes its own. */
export type BossPlanner = (userId: string, campaignId: string, ctx: BossContext) => Promise<{ plan: BossPlan; origin: 'ai' | 'fixture' } | null>;

export interface BossServiceOptions {
  readonly now?: () => Date;
  readonly planner?: BossPlanner | null;
}

type Res = { status: number; body: Record<string, unknown> };

function statusView(s: BossStatus) {
  switch (s.kind) {
    case 'won': return { status: 'won' };
    case 'active': return { status: 'active', encounterId: s.encounterId };
    case 'ready': return { status: 'ready' };
    case 'locked': return { status: 'locked', reason: s.reason };
    case 'recover': return { status: 'recover', recovery: { steps: s.recovery.steps, losses: s.recovery.losses } };
    case 'unavailable': return { status: 'unavailable' };
  }
}

export function createBossService(store: LearningStore, options: BossServiceOptions = {}) {
  const now = options.now ?? (() => new Date());

  async function list(userId: string, campaignId: string): Promise<Res> {
    const ctx = await loadBossContext(store, userId, campaignId);
    if (!ctx) return { status: 404, body: { error: 'That campaign was not found.' } };
    const course = toBossCourse(ctx);
    const records = toBossRecords(ctx);
    return {
      status: 200,
      body: {
        campaignStatus: ctx.campaignStatus,
        bosses: bossStages.map((stage) => ({ stage, ...statusView(bossStatus(course, records, stage)) })).filter((b) => b.status !== 'unavailable'),
      },
    };
  }

  /** What the player sees of a battle: the plan, Resolve, answered results and the current question (no answer key). */
  async function view(userId: string, encounterId: string): Promise<Res> {
    const raw = await store.call('boss_answer_context', { p_user_id: userId, p_encounter_id: encounterId });
    if (raw === null) return { status: 404, body: { error: 'That battle was not found.' } };
    const ctx = answerContextSchema.parse(raw);
    const e = ctx.encounter;
    return {
      status: 200,
      body: {
        encounter: {
          id: e.id, campaignId: e.campaignId, stage: e.stage, status: e.status, resolve: e.resolve, maxResolve: e.maxResolve,
          position: e.position, total: e.questionIds.length, plan: { ...e.plan, victory: e.status === 'won' ? e.plan.victory : null, defeat: e.status === 'lost' ? e.plan.defeat : null },
          planOrigin: e.planOrigin, answered: e.answers.map((a) => ({ itemId: a.itemId, correct: a.correct })),
        },
        question: e.status === 'active' && ctx.item ? publicItem(toItem(ctx.item)) : null,
      },
    };
  }

  async function start(userId: string, campaignId: string, stage: number): Promise<Res> {
    const ctx = await loadBossContext(store, userId, campaignId);
    if (!ctx) return { status: 404, body: { error: 'That campaign was not found.' } };
    if (ctx.campaignStatus !== 'active') return { status: 409, body: { error: 'Resume this campaign to face its bosses.', code: 'campaign_inactive' } };
    const course = toBossCourse(ctx);
    const records = toBossRecords(ctx);
    const status = bossStatus(course, records, stage);
    if (status.kind === 'active') return view(userId, status.encounterId);
    if (status.kind !== 'ready') {
      const reason = status.kind === 'locked' ? status.reason : status.kind === 'recover' ? 'Finish the recovery quest first.' : status.kind === 'won' ? 'You have already beaten this boss.' : 'This course has no boss at that stage.';
      return { status: 409, body: { error: reason, code: status.kind } };
    }

    const { bank, questions, competencies } = bossBank(course, records, stage);
    const names = new Map(competencies.map((c) => [c.id, c.name] as const));
    const strategistCtx: BossContext = {
      campaignTitle: ctx.campaignTitle,
      campaignDescription: ctx.campaignDescription,
      competencies,
      questions: questions.map((q) => ({ id: q.id, competencyIds: q.competencyIds.filter((id) => names.has(id)), concept: q.concept, difficulty: q.difficulty, kind: q.kind, prompt: q.prompt })),
    };
    let plan: BossPlan = gameBossPlan(stage, bank, names);
    let origin: 'ai' | 'fixture' | 'game' = 'game';
    const proposed = options.planner ? await options.planner(userId, campaignId, strategistCtx).catch(() => null) : null;
    // The engine checks the AI's plan once more before using it.
    if (proposed && checkBossPlan(bank, proposed.plan.rounds.map((r) => ({ competencyId: r.competencyId, questionIds: r.questionIds }))).length === 0) {
      plan = proposed.plan;
      origin = proposed.origin;
    }
    const questionIds = bossQuestionIds(plan);
    const id = z.string().parse(await store.call('boss_create_encounter', {
      p_user_id: userId, p_campaign_id: campaignId, p_stage: stage, p_plan: plan, p_origin: origin, p_question_ids: questionIds, p_max_resolve: bossConfig.startingResolve,
    }));
    return view(userId, id);
  }

  async function answer(userId: string, encounterId: string, position: number, given: Answer | null): Promise<Res> {
    const raw = await store.call('boss_answer_context', { p_user_id: userId, p_encounter_id: encounterId });
    if (raw === null) return { status: 404, body: { error: 'That battle was not found.' } };
    const ctx = answerContextSchema.parse(raw);
    const e = ctx.encounter;
    if (e.position !== position) return { status: 409, body: { error: 'That question has already been answered.', code: 'wrong_question' } };
    if (!ctx.item) return { status: 409, body: { error: 'This battle is over.', code: 'not_active' } };
    const item = toItem(ctx.item);
    const w = ctx.weakness;
    const weakness: WeaknessState | null = w ? {
      concept: w.concept_id, status: w.status, errorCategory: w.error_category, occurrenceCount: w.occurrence_count, correctReviews: w.correct_reviews,
      nextReviewAt: w.next_review_at, lastMistakeAt: w.last_mistake_at, lastSuccessfulReview: w.last_successful_review, resolvedAt: w.resolved_at,
      incorrectResponses: w.incorrect_responses,
    } : null;
    const at = now();
    const outcome = resolveBossAnswer(
      { id: e.id, campaignId: e.campaignId, stage: e.stage, status: e.status, resolve: e.resolve, position: e.position, questionIds: e.questionIds },
      ctx.campaignStatus, item, given, weakness, at,
    );
    if (!outcome.ok) return { status: 409, body: { error: outcome.message, code: outcome.code } };
    const ws = outcome.weakness?.state;
    const recorded = z.object({ xpPaid: z.boolean() }).parse(await store.call('boss_record_answer', {
      p_user_id: userId, p_encounter_id: encounterId, p_position: position,
      p_outcome: {
        itemId: item.key, conceptId: item.concept, correct: outcome.correct, given, resolve: outcome.resolve, status: outcome.status, xp: outcome.xp,
        weakness: ws ? {
          conceptId: ws.concept, status: ws.status, errorCategory: ws.errorCategory, occurrenceCount: ws.occurrenceCount, correctReviews: ws.correctReviews,
          nextReviewAt: iso(ws.nextReviewAt), lastMistakeAt: iso(ws.lastMistakeAt), lastSuccessfulReview: iso(ws.lastSuccessfulReview), resolvedAt: iso(ws.resolvedAt),
          incorrectResponses: ws.incorrectResponses,
        } : null,
      },
    }));
    const next = await view(userId, encounterId);
    return {
      status: 200,
      body: {
        ...next.body,
        result: {
          correct: outcome.correct,
          answer: item.kind === 'written' ? item.modelAnswer : item.answer,
          explanation: item.explanation,
          weakness: outcome.weakness?.event ?? null,
          xp: recorded.xpPaid && outcome.xp ? outcome.xp.amount : 0,
        },
      },
    };
  }

  return { list, start, answer, view };
}
