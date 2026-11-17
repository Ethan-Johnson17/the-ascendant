import { z } from 'zod';
import { errorCategories } from '../../engine/learning/config.ts';
import { assessmentItemSchema, type AssessmentItem } from '../../engine/learning/curriculum.ts';
import { answerSchema, publicItem, type Answer } from '../../engine/learning/grading.ts';
import type { WeaknessState } from '../../engine/learning/weakness.ts';
import { checkBossPlan } from '../../engine/encounters/bossPlan.ts';
import {
  bossBank, bossQuestionIds, bossStages, bossStatus, gameBossPlan, resolveBossAnswer, type BossCourse, type BossRecords, type BossStatus,
} from '../../engine/encounters/boss.ts';
import {
  adaptableQuestion, gambitOrder, hintFor, isActivePower, luckyQuestion, powerIds, powerInfo, startingResolve,
  type ActivePowerId, type PowerId,
} from '../../engine/encounters/powers.ts';
import type { BossContext, BossPlan } from '../ai/roles/strategist.ts';
import type { LearningStore } from '../learning/learningService.ts';

/**
 * Server side of boss battles (runs in the `learning` Edge Function). The engine decides; this
 * file loads context, asks the Strategist (AI) for a plan when one is available, and records.
 * Race traits and class abilities: src/engine/encounters/powers.ts.
 */

const date = z.string().transform((s) => new Date(s));
const powerList = z.array(z.enum(powerIds)).default([]);

export const bossContextRowSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  campaignTitle: z.string(),
  campaignDescription: z.string(),
  powers: powerList,
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

const roundSchema = z.object({ competencyId: z.string(), competencyName: z.string(), title: z.string(), narration: z.string().nullable(), questionIds: z.array(z.string()) });
const planSchema = z.object({
  name: z.string(), epithet: z.string(), intro: z.array(z.string()), rounds: z.array(roundSchema),
  victory: z.string(), defeat: z.string(), removed: z.number().int(),
});
type StoredPlan = z.infer<typeof planSchema>;

const hintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove_option'), optionKey: z.string() }),
  z.object({ kind: z.literal('place'), entryKey: z.string(), position: z.number().int() }),
  z.object({ kind: z.literal('pair'), leftKey: z.string(), rightKey: z.string() }),
]);
const scoutSchema = z.object({ roundIndex: z.number().int(), title: z.string(), competencyName: z.string(), concepts: z.array(z.string()) });
const effectsSchema = z.object({
  hints: z.record(z.string(), hintSchema).optional(),
  scout: scoutSchema.optional(),
  recall: z.object({ itemId: z.string(), conceptId: z.string() }).optional(),
});

const answerContextSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  powers: powerList,
  encounter: z.object({
    id: z.string(), campaignId: z.string(), stage: z.number().int(), status: z.enum(['active', 'won', 'lost']), resolve: z.number().int(), maxResolve: z.number().int(),
    position: z.number().int(), questionIds: z.array(z.string()), plan: planSchema, planOrigin: z.enum(['ai', 'fixture', 'game']),
    answers: z.array(z.object({ itemId: z.string(), conceptId: z.string(), correct: z.boolean(), given: answerSchema.nullable(), power: z.string().nullable().optional() })),
    endedAt: z.string().nullable(),
    powersUsed: powerList,
    effects: effectsSchema.default({}),
  }),
  item: z.object({ id: z.string(), conceptId: z.string(), definition: z.record(z.string(), z.unknown()) }).nullable(),
  weakness: z.object({
    concept_id: z.string(), status: z.enum(['open', 'resolved']), error_category: z.enum(errorCategories), occurrence_count: z.number().int(),
    correct_reviews: z.number().int(), next_review_at: date.nullable(), last_mistake_at: date, last_successful_review: date.nullable(),
    resolved_at: date.nullable(), incorrect_responses: z.array(answerSchema),
  }).nullable(),
});
type AnswerContext = z.infer<typeof answerContextSchema>;

const toItem = (row: { id: string; conceptId: string; definition: Record<string, unknown> }): AssessmentItem => ({ ...assessmentItemSchema.parse(row.definition), key: row.id, concept: row.conceptId });
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const roundIndexOf = (plan: StoredPlan, itemId: string) => plan.rounds.findIndex((r) => r.questionIds.includes(itemId));

/** Proposes a plan with the Strategist (AI). Null when no AI is available: the game makes its own. */
export type BossPlanner = (userId: string, campaignId: string, ctx: BossContext) => Promise<{ plan: BossPlan; origin: 'ai' | 'fixture' } | null>;

export interface BossServiceOptions {
  readonly now?: () => Date;
  readonly planner?: BossPlanner | null;
}

type Res = { status: number; body: Record<string, unknown> };
const refuse = (status: number, error: string, code: string): Res => ({ status, body: { error, code } });

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

const powersView = (owned: readonly PowerId[], used: readonly PowerId[]) =>
  owned.map((id) => ({ id, ...powerInfo[id], active: isActivePower(id), used: used.includes(id) }));

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
        powers: powersView(ctx.powers, []),
        bosses: bossStages.map((stage) => ({ stage, ...statusView(bossStatus(course, records, stage)) })).filter((b) => b.status !== 'unavailable'),
      },
    };
  }

  async function loadAnswerContext(userId: string, encounterId: string): Promise<AnswerContext | null> {
    const raw = await store.call('boss_answer_context', { p_user_id: userId, p_encounter_id: encounterId });
    return raw === null ? null : answerContextSchema.parse(raw);
  }

  /** What the player sees of a battle: the plan, Resolve, powers, answered results and the current question (no answer key). */
  function present(ctx: AnswerContext): Res {
    const e = ctx.encounter;
    const current = e.status === 'active' ? e.questionIds[e.position] ?? null : null;
    const last = e.answers.at(-1);
    return {
      status: 200,
      body: {
        encounter: {
          id: e.id, campaignId: e.campaignId, stage: e.stage, status: e.status, resolve: e.resolve, maxResolve: e.maxResolve,
          position: e.position, total: e.questionIds.length, plan: { ...e.plan, victory: e.status === 'won' ? e.plan.victory : null, defeat: e.status === 'lost' ? e.plan.defeat : null },
          planOrigin: e.planOrigin, answered: e.answers.map((a) => ({ itemId: a.itemId, correct: a.correct })),
          powers: powersView(ctx.powers, e.powersUsed),
          lastPower: last?.power ?? null,
          hint: current ? e.effects.hints?.[current] ?? null : null,
          scout: e.effects.scout ?? null,
          recall: e.effects.recall ?? null,
        },
        question: e.status === 'active' && ctx.item ? publicItem(toItem(ctx.item)) : null,
      },
    };
  }

  async function view(userId: string, encounterId: string): Promise<Res> {
    const ctx = await loadAnswerContext(userId, encounterId);
    return ctx ? present(ctx) : { status: 404, body: { error: 'That battle was not found.' } };
  }

  async function start(userId: string, campaignId: string, stage: number): Promise<Res> {
    const ctx = await loadBossContext(store, userId, campaignId);
    if (!ctx) return { status: 404, body: { error: 'That campaign was not found.' } };
    if (ctx.campaignStatus !== 'active') return refuse(409, 'Resume this campaign to face its bosses.', 'campaign_inactive');
    const course = toBossCourse(ctx);
    const records = toBossRecords(ctx);
    const status = bossStatus(course, records, stage);
    if (status.kind === 'active') return view(userId, status.encounterId);
    if (status.kind !== 'ready') {
      const reason = status.kind === 'locked' ? status.reason : status.kind === 'recover' ? 'Finish the recovery quest first.' : status.kind === 'won' ? 'You have already beaten this boss.' : 'This course has no boss at that stage.';
      return refuse(409, reason, status.kind);
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
    const id = z.string().parse(await store.call('boss_create_encounter', {
      p_user_id: userId, p_campaign_id: campaignId, p_stage: stage, p_plan: plan, p_origin: origin, p_question_ids: bossQuestionIds(plan), p_max_resolve: startingResolve(ctx.powers),
    }));
    return view(userId, id);
  }

  /** The bank of questions this battle's boss may use (for Lucky and Adaptable). */
  async function bankFor(userId: string, campaignId: string, stage: number) {
    const ctx = await loadBossContext(store, userId, campaignId);
    if (!ctx) return null;
    return { ctx, ...bossBank(toBossCourse(ctx), toBossRecords(ctx), stage) };
  }

  async function answer(userId: string, encounterId: string, position: number, given: Answer | null): Promise<Res> {
    const ctx = await loadAnswerContext(userId, encounterId);
    if (!ctx) return { status: 404, body: { error: 'That battle was not found.' } };
    const e = ctx.encounter;
    if (e.position !== position) return refuse(409, 'That question has already been answered.', 'wrong_question');
    if (!ctx.item) return refuse(409, 'This battle is over.', 'not_active');
    const item = toItem(ctx.item);
    const w = ctx.weakness;
    const weakness: WeaknessState | null = w ? {
      concept: w.concept_id, status: w.status, errorCategory: w.error_category, occurrenceCount: w.occurrence_count, correctReviews: w.correct_reviews,
      nextReviewAt: w.next_review_at, lastMistakeAt: w.last_mistake_at, lastSuccessfulReview: w.last_successful_review, resolvedAt: w.resolved_at,
      incorrectResponses: w.incorrect_responses,
    } : null;
    // Lucky needs a new question ready in case this answer is wrong.
    const lucky = ctx.powers.includes('lucky') && !e.powersUsed.includes('lucky')
      ? await bankFor(userId, e.campaignId, e.stage).then((b) => (b ? luckyQuestion(b.bank, e.questionIds, item.key) : null))
      : null;
    const outcome = resolveBossAnswer(
      { id: e.id, campaignId: e.campaignId, stage: e.stage, status: e.status, resolve: e.resolve, maxResolve: e.maxResolve, position: e.position, questionIds: e.questionIds, powers: ctx.powers, powersUsed: e.powersUsed },
      ctx.campaignStatus, item, given, weakness, now(), lucky,
    );
    if (!outcome.ok) return refuse(409, outcome.message, outcome.code);
    let plan: StoredPlan | null = null;
    if (outcome.power === 'lucky') {
      // The new question joins the missed question's round, right after it.
      const ri = roundIndexOf(e.plan, item.key);
      plan = { ...e.plan, rounds: e.plan.rounds.map((r, i) => (i === ri ? { ...r, questionIds: r.questionIds.flatMap((q) => (q === item.key ? [q, lucky!] : [q])) } : r)) };
    }
    const ws = outcome.weakness?.state;
    const recorded = z.object({ xpPaid: z.boolean() }).parse(await store.call('boss_record_answer', {
      p_user_id: userId, p_encounter_id: encounterId, p_position: position,
      p_outcome: {
        itemId: item.key, conceptId: item.concept, correct: outcome.correct, given, resolve: outcome.resolve, status: outcome.status, xp: outcome.xp,
        power: outcome.power, questionIds: outcome.questionIds, plan,
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
          power: outcome.power,
        },
      },
    };
  }

  /** Uses a power the player chose. The engine works out its effect; the database checks it. */
  async function usePower(userId: string, encounterId: string, position: number, power: ActivePowerId): Promise<Res> {
    const ctx = await loadAnswerContext(userId, encounterId);
    if (!ctx) return { status: 404, body: { error: 'That battle was not found.' } };
    const e = ctx.encounter;
    if (ctx.campaignStatus !== 'active') return refuse(409, 'Resume this campaign to continue the battle.', 'campaign_inactive');
    if (e.status !== 'active' || !ctx.item) return refuse(409, 'This battle is over.', 'not_active');
    if (e.position !== position) return refuse(409, 'That question has already been answered.', 'wrong_question');
    if (!ctx.powers.includes(power)) return refuse(403, 'That isn’t one of your powers.', 'not_yours');
    if (e.powersUsed.includes(power)) return refuse(409, `You have already used ${powerInfo[power].name} in this battle.`, 'used');
    const item = toItem(ctx.item);
    const effect: Record<string, unknown> = {};

    if (power === 'adaptable') {
      const b = await bankFor(userId, e.campaignId, e.stage);
      const newId = b ? adaptableQuestion(b.bank, e.questionIds, item.key) : null;
      if (!newId) return refuse(409, 'No other skill has a question left to swap in.', 'no_effect');
      effect.questionIds = e.questionIds.map((q, i) => (i === e.position ? newId : q));
      effect.plan = { ...e.plan, rounds: e.plan.rounds.map((r) => ({ ...r, questionIds: r.questionIds.map((q) => (q === item.key ? newId : q)) })) };
    } else if (power === 'gambit') {
      const order = gambitOrder(e.questionIds, e.position);
      if (!order) return refuse(409, 'This is the last question: there is nothing to skip ahead to.', 'no_effect');
      effect.questionIds = order;
    } else if (power === 'keen_insight') {
      const hint = hintFor(item);
      if (!hint) return refuse(409, 'There is no hint to give for this question.', 'no_effect');
      effect.hint = hint;
    } else if (power === 'scout_ahead') {
      const ri = roundIndexOf(e.plan, item.key);
      const nextRound = ri >= 0 ? e.plan.rounds[ri + 1] : undefined;
      if (!nextRound) return refuse(409, 'This is the last round: there is nothing ahead to scout.', 'no_effect');
      const b = await bankFor(userId, e.campaignId, e.stage);
      const concepts = [...new Set(nextRound.questionIds.map((id) => b?.ctx.questions.find((q) => q.id === id)?.concept).filter((c): c is string => !!c))];
      effect.scout = { roundIndex: ri + 1, title: nextRound.title, competencyName: nextRound.competencyName, concepts };
    }
    await store.call('boss_use_power', { p_user_id: userId, p_encounter_id: encounterId, p_position: position, p_power: power, p_effect: effect });
    return view(userId, encounterId);
  }

  return { list, start, answer, view, usePower };
}

