import { z } from 'zod';
import type { LearningStore } from '../learning/learningService.ts';
import { defaultAiConfig, type AiConfig } from './config.ts';
import { runStructured } from './structured.ts';
import { createUsageLog } from './usageLog.ts';
import { AiError, noUsage, type AiProvider } from './types.ts';
import { buildTutorMessages, checkCitations, tutorAnswerSchema, tutorMaterialSchema, type TutorMaterial } from './roles/tutor.ts';
import { advisorContextSchema, advisorReplySchema, advisorStepSchema, buildAdvisorMessages, checkAdvice, type AdvisorStep } from './roles/advisor.ts';
import { buildResearcherMessages, researchContextSchema, researcherReplySchema, toCandidates } from './roles/researcher.ts';
import { createCatalogues } from '../research/catalogues.ts';
import type { FetchLike } from '../research/safeFetch.ts';
import { verifySource } from '../research/verify.ts';
import { courseRequestSchema } from './roles/courseBuilder.ts';
import { createSubjectService } from '../subjects/subjectService.ts';
import { createWikipedia } from '../subjects/wikipedia.ts';
import { buildGameMasterMessages, checkScene, gameMasterReplySchema, previewScene, sceneContextSchema } from './roles/gameMaster.ts';
import { bossContextSchema, buildStrategistMessages, checkStrategy, strategistReplySchema, toBank } from './roles/strategist.ts';
import { bossReadiness, focusBank } from '../../engine/encounters/bossPlan.ts';
import type { AiRole } from './types.ts';

/**
 * The server side of AI features: what the `ai` Edge Function runs for each request.
 *
 *   1. load the material the role may use      (service-role SQL, ai_*_context)
 *   2. count the request against the limits     (ai_reserve_request, atomic)
 *   3. call the provider; accept only replies that pass the schema (one repair attempt)
 *   4. check citations against known sources
 *   5. log the outcome                          (ai_finish_request; tokens, never text)
 *
 * The AI never changes game state here: the Tutor and the Progression Advisor only explain. Runs unchanged in Node (tests,
 * against PGlite) and Deno (Edge Function).
 */

export const aiRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ask_tutor'),
    campaignId: z.uuid(),
    lessonId: z.string().min(1).max(200),
    question: z.string().trim().min(2).max(defaultAiConfig.tutor.maxQuestionChars),
    history: z
      .array(z.object({ question: z.string().max(defaultAiConfig.tutor.maxQuestionChars), answer: z.string().max(defaultAiConfig.tutor.maxHistoryChars) }))
      .max(defaultAiConfig.tutor.maxHistoryTurns)
      .default([]),
  }),
  z.object({
    action: z.literal('advise'),
    campaignId: z.uuid(),
    /** The engine's plan, as the app computed it. Only kinds and ids: titles come from the database. */
    steps: z.array(advisorStepSchema).min(1).max(3),
  }),
  z.object({
    action: z.literal('research'),
    campaignId: z.uuid(),
    conceptId: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('create_subject'), request: courseRequestSchema }),
  z.object({ action: z.literal('build_lesson'), templateId: z.string().regex(/^ai-[a-z0-9]{6,40}$/) }),
  z.object({
    action: z.literal('narrate_scene'),
    campaignId: z.uuid(),
    message: z.string().trim().min(1).max(defaultAiConfig.gameMaster.maxMessageChars).nullable().default(null),
    history: z
      .array(z.object({ player: z.string().max(defaultAiConfig.gameMaster.maxMessageChars), narration: z.string().max(1500) }))
      .max(defaultAiConfig.gameMaster.maxHistoryTurns)
      .default([]),
  }),
  z.object({ action: z.literal('plan_boss'), campaignId: z.uuid() }),
  z.object({ action: z.literal('usage') }),
]);

export interface AiResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface AiServiceOptions {
  readonly now?: () => Date;
  readonly config?: AiConfig;
  readonly sleep?: (ms: number) => Promise<void>;
  /** How the Researcher's suggestions are checked. Tests pass a fake; the default is the real web. */
  readonly research?: { readonly fetch?: FetchLike; readonly timeoutMs?: number };
  /** How the Course Builder reads Wikipedia, and how new subject ids are made. Tests pass fakes. */
  readonly subjects?: { readonly fetch?: FetchLike; readonly timeoutMs?: number; readonly newId?: () => string };
}

/** Player-facing wording for each failure. Never claims a result the AI didn't give. */
const failureMessage: Record<AiError['kind'] | 'internal', { status: number; error: string }> = {
  not_configured: { status: 503, error: 'The Tutor isn’t set up on this server yet.' },
  timeout: { status: 504, error: 'The Tutor took too long to answer. Please try again.' },
  rate_limited: { status: 503, error: 'The Tutor is resting: the shared free AI allowance is used up for now. Please try again later.' },
  unavailable: { status: 503, error: 'The Tutor can’t be reached right now. Please try again in a moment.' },
  bad_output: { status: 502, error: 'The Tutor’s answer came back garbled, so it wasn’t shown. Please try again or rephrase your question.' },
  refused: { status: 422, error: 'The Tutor couldn’t answer that. Try asking about the lesson in a different way.' },
  internal: { status: 500, error: 'Something went wrong. Please try again.' },
};

const researcherFailure: Record<AiError['kind'] | 'internal', { status: number; error: string }> = {
  not_configured: { status: 503, error: 'The Researcher isn’t set up on this server yet.' },
  timeout: { status: 504, error: 'The Researcher took too long. Please try again later.' },
  rate_limited: { status: 503, error: 'The Researcher is resting: the shared free AI allowance is used up for now.' },
  unavailable: { status: 503, error: 'The Researcher can’t be reached right now. Please try again in a moment.' },
  bad_output: { status: 502, error: 'The Researcher’s suggestions came back garbled, so none were shown.' },
  refused: { status: 422, error: 'The Researcher couldn’t suggest anything for this concept.' },
  internal: { status: 500, error: 'Something went wrong. Please try again.' },
};

/** Wording for the Game Master and the Strategist (no screens yet; Phase 5 uses them). */
const roleFailure = (who: string): Record<AiError['kind'] | 'internal', { status: number; error: string }> => ({
  not_configured: { status: 503, error: `The ${who} isn’t set up on this server yet.` },
  timeout: { status: 504, error: `The ${who} took too long. Please try again later.` },
  rate_limited: { status: 503, error: `The ${who} is resting: the shared free AI allowance is used up for now.` },
  unavailable: { status: 503, error: `The ${who} can’t be reached right now. Please try again in a moment.` },
  bad_output: { status: 502, error: `The ${who}’s reply didn’t follow the game’s rules, so it wasn’t used.` },
  refused: { status: 422, error: `The ${who} couldn’t do that.` },
  internal: { status: 500, error: 'Something went wrong. Please try again.' },
});

const advisorFailure: Record<AiError['kind'] | 'internal', { status: number; error: string }> = {
  not_configured: { status: 503, error: 'The Advisor isn’t set up on this server yet. Your next steps above still work.' },
  timeout: { status: 504, error: 'The Advisor took too long. Your next steps above still work; try again later.' },
  rate_limited: { status: 503, error: 'The Advisor is resting: the shared free AI allowance is used up for now.' },
  unavailable: { status: 503, error: 'The Advisor can’t be reached right now. Please try again in a moment.' },
  bad_output: { status: 502, error: 'The Advisor’s explanation came back garbled, so it wasn’t shown.' },
  refused: { status: 422, error: 'The Advisor couldn’t explain this plan.' },
  internal: { status: 500, error: 'Something went wrong. Please try again.' },
};

/**
 * @param provider `null` when no AI provider is configured: requests then fail clearly with
 *   `not_configured` and are not counted against the player's limit.
 */
export function createAiService(store: LearningStore, provider: AiProvider | null, options: AiServiceOptions = {}) {
  const now = options.now ?? (() => new Date());
  const config = options.config ?? defaultAiConfig;

  const log = createUsageLog(store, provider?.id ?? null, config, now);
  const { usage, finish } = log;

  async function askTutor(userId: string, req: Extract<z.infer<typeof aiRequestSchema>, { action: 'ask_tutor' }>): Promise<AiResponse> {
    const raw = await store.call('ai_tutor_context', { p_user_id: userId, p_campaign_id: req.campaignId, p_activity_id: req.lessonId });
    if (raw === null) return { status: 404, body: { error: 'That lesson was not found in this campaign.' } };
    const material: TutorMaterial = tutorMaterialSchema.parse(raw);
    if (!provider) return { status: failureMessage.not_configured.status, body: { error: failureMessage.not_configured.error, code: 'not_configured' } };

    const reservation = await log.reserve(userId, 'tutor', req.campaignId);
    if (!reservation.ok) {
      if (reservation.code === 'daily_limit') {
        return { status: 429, body: { error: `You’ve used all ${config.dailyRequestsPerPlayer} AI requests for today. Lessons, checks and the Codex still work.`, code: 'daily_limit', usage: await usage(userId) } };
      }
      return { status: 429, body: { error: 'That’s a lot of questions in one minute. Take a breath and try again shortly.', code: 'minute_limit' } };
    }

    const history = req.history.map((t) => ({ question: t.question, answer: t.answer }));
    try {
      const result = await runStructured(
        provider,
        {
          role: 'tutor',
          schemaName: 'tutor_answer',
          messages: buildTutorMessages(material, req.question, history),
          maxOutputTokens: config.maxOutputTokens.tutor ?? 1500,
          temperature: 0.2,
          fixtureHint: { material, question: req.question },
        },
        tutorAnswerSchema,
        { transientRetries: config.transientRetries, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      const answer = checkCitations(result.data, material);
      await finish(userId, reservation.requestId, 'ok', { origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: null, repairReason: result.repairReason });
      const used = new Set(answer.paragraphs.flatMap((p) => p.sourceIds));
      return {
        status: 200,
        body: {
          answer,
          origin: result.origin,
          sources: material.sources.filter((s) => used.has(s.id)),
          usage: { used: reservation.usedToday, limit: config.dailyRequestsPerPlayer, remaining: Math.max(0, config.dailyRequestsPerPlayer - reservation.usedToday) },
        },
      };
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'internal';
      await finish(userId, reservation.requestId, 'failed', {
        origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model, errorKind: kind,
        repairReason: err instanceof AiError ? err.repairReason : null,
      });
      if (kind === 'internal') throw err;
      const f = failureMessage[kind];
      return { status: f.status, body: { error: f.error, code: kind } };
    }
  }

  async function advise(userId: string, req: Extract<z.infer<typeof aiRequestSchema>, { action: 'advise' }>): Promise<AiResponse> {
    const ids = [...new Set(req.steps.map((st) => st.activityId))];
    if (ids.length !== req.steps.length) return { status: 400, body: { error: 'The request was not understood.' } };
    const raw = await store.call('ai_advisor_context', { p_user_id: userId, p_campaign_id: req.campaignId, p_activity_ids: ids });
    if (raw === null) return { status: 404, body: { error: 'That campaign was not found.' } };
    const ctx = advisorContextSchema.parse(raw);
    const byId = new Map(ctx.activities.map((a) => [a.id, a] as const));
    const steps: AdvisorStep[] = [];
    for (const st of req.steps) {
      const a = byId.get(st.activityId);
      // A lesson step must name a lesson; every other kind names a check.
      if (!a || (st.kind === 'lesson') !== (a.kind === 'lesson')) return { status: 422, body: { error: 'That plan doesn’t match this campaign.' } };
      steps.push({ kind: st.kind, title: a.title });
    }
    if (!provider) return { status: advisorFailure.not_configured.status, body: { error: advisorFailure.not_configured.error, code: 'not_configured' } };

    const reservation = await log.reserve(userId, 'progression_advisor', req.campaignId);
    if (!reservation.ok) {
      if (reservation.code === 'daily_limit') {
        return { status: 429, body: { error: `You’ve used all ${config.dailyRequestsPerPlayer} AI requests for today. Your next steps still work without the Advisor.`, code: 'daily_limit', usage: await usage(userId) } };
      }
      return { status: 429, body: { error: 'That’s a lot of AI requests in one minute. Try again shortly.', code: 'minute_limit' } };
    }
    try {
      const result = await runStructured(
        provider,
        {
          role: 'progression_advisor',
          schemaName: 'advisor_reply',
          messages: buildAdvisorMessages(ctx.campaignTitle, steps),
          maxOutputTokens: config.maxOutputTokens.progression_advisor ?? 1200,
          temperature: 0.4,
          fixtureHint: { steps },
        },
        advisorReplySchema,
        { transientRetries: config.transientRetries, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      const advice = checkAdvice(result.data, steps.length);
      await finish(userId, reservation.requestId, advice ? 'ok' : 'failed', {
        origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: advice ? null : 'bad_output', repairReason: result.repairReason,
      });
      if (!advice) return { status: advisorFailure.bad_output.status, body: { error: advisorFailure.bad_output.error, code: 'bad_output' } };
      return {
        status: 200,
        body: {
          advice: { summary: advice.summary, steps: req.steps.map((st, i) => ({ activityId: st.activityId, why: advice.whys[i]! })) },
          origin: result.origin,
          usage: { used: reservation.usedToday, limit: config.dailyRequestsPerPlayer, remaining: Math.max(0, config.dailyRequestsPerPlayer - reservation.usedToday) },
        },
      };
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'internal';
      await finish(userId, reservation.requestId, 'failed', {
        origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model, errorKind: kind,
        repairReason: err instanceof AiError ? err.repairReason : null,
      });
      if (kind === 'internal') throw err;
      const f = advisorFailure[kind];
      return { status: f.status, body: { error: f.error, code: kind } };
    }
  }

  async function research(userId: string, req: Extract<z.infer<typeof aiRequestSchema>, { action: 'research' }>): Promise<AiResponse> {
    const raw = await store.call('ai_research_context', { p_user_id: userId, p_campaign_id: req.campaignId, p_concept_id: req.conceptId });
    if (raw === null) return { status: 404, body: { error: 'That concept was not found in this campaign.' } };
    const ctx = researchContextSchema.parse(raw);
    if (ctx.lastResearchAt) {
      const next = new Date(new Date(ctx.lastResearchAt).getTime() + config.researchCooldownDays * 86_400_000);
      if (next > now()) {
        return { status: 429, body: { error: `Further reading for this concept was searched recently. You can search again after ${next.toDateString()}.`, code: 'recently_researched', nextAvailableAt: next.toISOString() } };
      }
    }
    if (!provider) return { status: researcherFailure.not_configured.status, body: { error: researcherFailure.not_configured.error, code: 'not_configured' } };

    const reservation = await log.reserve(userId, 'researcher', req.campaignId);
    if (!reservation.ok) {
      if (reservation.code === 'daily_limit') {
        return { status: 429, body: { error: `You’ve used all ${config.dailyRequestsPerPlayer} AI requests for today. The Codex and its sources still work.`, code: 'daily_limit', usage: await usage(userId) } };
      }
      return { status: 429, body: { error: 'That’s a lot of AI requests in one minute. Try again shortly.', code: 'minute_limit' } };
    }
    let result;
    try {
      result = await runStructured(
        provider,
        {
          role: 'researcher',
          schemaName: 'researcher_reply',
          messages: buildResearcherMessages(ctx),
          maxOutputTokens: config.maxOutputTokens.researcher ?? 1500,
          temperature: 0,
          fixtureHint: { concept: ctx.concept },
        },
        researcherReplySchema,
        { transientRetries: config.transientRetries, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      await finish(userId, reservation.requestId, 'ok', { origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: null, repairReason: result.repairReason });
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'internal';
      await finish(userId, reservation.requestId, 'failed', {
        origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model, errorKind: kind,
        repairReason: err instanceof AiError ? err.repairReason : null,
      });
      if (kind === 'internal') throw err;
      const f = researcherFailure[kind];
      return { status: f.status, body: { error: f.error, code: kind } };
    }

    // Our own code checks every suggestion; the AI is not involved in deciding what counts.
    const fetcher: FetchLike = options.research?.fetch ?? ((input, init) => fetch(input, init));
    const timeoutMs = options.research?.timeoutMs ?? 8000;
    const catalogues = createCatalogues(fetcher, timeoutMs);
    const candidates = toCandidates(result.data, ctx.knownSources);
    const checked = await Promise.all(
      candidates.map(async (c) => ({ ...(await verifySource(c, [ctx.concept.title], { fetch: fetcher, catalogues, timeoutMs })), why: c.why })),
    );
    await store.call('ai_record_research', {
      p_user_id: userId, p_campaign_id: req.campaignId, p_concept_id: req.conceptId, p_origin: result.origin,
      p_results: checked.map((s) => ({
        ...s,
        title: s.title.slice(0, 300), author: s.author?.slice(0, 300) ?? null, publisher: s.publisher?.slice(0, 200) ?? null,
        doi: s.doi?.slice(0, 150) ?? null, why: s.why.slice(0, 300),
        url: s.url && s.url.startsWith('https://') && s.url.length <= 600 ? s.url : null,
      })),
    });
    const verified = checked.filter((s) => s.status === 'verified');
    return {
      status: 200,
      body: {
        results: verified,
        suggested: checked.length,
        hidden: checked.length - verified.length,
        origin: result.origin,
        usage: { used: reservation.usedToday, limit: config.dailyRequestsPerPlayer, remaining: Math.max(0, config.dailyRequestsPerPlayer - reservation.usedToday) },
      },
    };
  }

  /**
   * One request for a role whose reply our code then checks: reserve, call, check, log. `check`
   * returns the response body, or a reason (field paths and codes only) when the reply broke a rule.
   */
  async function runChecked<T>(
    userId: string,
    campaignId: string,
    role: AiRole,
    who: string,
    call: { schemaName: string; messages: ReturnType<typeof buildGameMasterMessages>; temperature: number; fixtureHint: unknown },
    schema: z.ZodType<T>,
    check: (data: T) => { body: Record<string, unknown> } | { reason: string },
  ): Promise<AiResponse> {
    const failure = roleFailure(who);
    if (!provider) return { status: failure.not_configured.status, body: { error: failure.not_configured.error, code: 'not_configured' } };
    const reservation = await log.reserve(userId, role, campaignId);
    if (!reservation.ok) {
      if (reservation.code === 'daily_limit') return { status: 429, body: { error: `You’ve used all ${config.dailyRequestsPerPlayer} AI requests for today.`, code: 'daily_limit', usage: await usage(userId) } };
      return { status: 429, body: { error: 'That’s a lot of AI requests in one minute. Try again shortly.', code: 'minute_limit' } };
    }
    try {
      const result = await runStructured(
        provider,
        { role, schemaName: call.schemaName, messages: call.messages, maxOutputTokens: config.maxOutputTokens[role] ?? 1500, temperature: call.temperature, fixtureHint: call.fixtureHint },
        schema,
        { transientRetries: config.transientRetries, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      const checked = check(result.data);
      const broke = 'reason' in checked;
      await finish(userId, reservation.requestId, broke ? 'failed' : 'ok', {
        origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: broke ? 'bad_output' : null,
        repairReason: broke ? checked.reason.slice(0, 300) : result.repairReason,
      });
      if (broke) return { status: failure.bad_output.status, body: { error: failure.bad_output.error, code: 'bad_output' } };
      return {
        status: 200,
        body: { ...checked.body, origin: result.origin, usage: { used: reservation.usedToday, limit: config.dailyRequestsPerPlayer, remaining: Math.max(0, config.dailyRequestsPerPlayer - reservation.usedToday) } },
      };
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'internal';
      await finish(userId, reservation.requestId, 'failed', {
        origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model, errorKind: kind,
        repairReason: err instanceof AiError ? err.repairReason : null,
      });
      if (kind === 'internal') throw err;
      return { status: failure[kind].status, body: { error: failure[kind].error, code: kind } };
    }
  }

  /** The Game Master narrates the preview scene. It changes nothing and nothing is saved. */
  async function narrateScene(userId: string, req: Extract<z.infer<typeof aiRequestSchema>, { action: 'narrate_scene' }>): Promise<AiResponse> {
    const raw = await store.call('ai_scene_context', { p_user_id: userId, p_campaign_id: req.campaignId });
    if (raw === null) return { status: 404, body: { error: 'That campaign was not found.' } };
    const ctx = sceneContextSchema.parse(raw);
    const scene = previewScene();
    return runChecked(
      userId, req.campaignId, 'game_master', 'Game Master',
      { schemaName: 'game_master_scene', messages: buildGameMasterMessages(ctx, scene, req.message, req.history), temperature: 0.8, fixtureHint: { scene } },
      gameMasterReplySchema,
      (data) => {
        const checked = checkScene(data, scene);
        return checked ? { body: { scene: checked } } : { reason: 'scene: no_narration_or_missing_choice' };
      },
    );
  }

  /**
   * The Strategist proposes a boss from the course's checked questions; the engine decides whether
   * the plan is allowed. Nothing is saved (bosses arrive in Phase 5). The reply carries question
   * ids only, never options or answers.
   */
  async function planBoss(userId: string, req: Extract<z.infer<typeof aiRequestSchema>, { action: 'plan_boss' }>): Promise<AiResponse> {
    const raw = await store.call('ai_boss_context', { p_user_id: userId, p_campaign_id: req.campaignId });
    if (raw === null) return { status: 404, body: { error: 'That campaign was not found.' } };
    const full = bossContextSchema.parse(raw);
    // The engine picks the competencies and checks a fair boss is possible before any AI request.
    const focus = focusBank(toBank(full));
    const keep = new Set(focus.competencies.map((c) => c.id));
    const qKeep = new Set(focus.questions.map((q) => q.id));
    const ctx = { ...full, competencies: full.competencies.filter((c) => keep.has(c.id)), questions: full.questions.filter((q) => qKeep.has(q.id)) };
    if (!bossReadiness(focus).ready) {
      return { status: 409, body: { error: 'This course doesn’t have enough checked questions for a boss yet. Build and study more lessons first.', code: 'not_ready' } };
    }
    return runChecked(
      userId, req.campaignId, 'strategist', 'Strategist',
      { schemaName: 'strategist_boss', messages: buildStrategistMessages(ctx), temperature: 0.7, fixtureHint: { context: ctx } },
      strategistReplySchema,
      (data) => {
        const checked = checkStrategy(data, ctx);
        return 'plan' in checked ? { body: { boss: checked.plan } } : { reason: `plan: ${checked.problems.join(',')}` };
      },
    );
  }

  const subjects = createSubjectService({
    store, provider, config, log, now,
    wikipedia: createWikipedia(options.subjects?.fetch ?? ((input, init) => fetch(input, init)), options.subjects?.timeoutMs ?? 8000),
    ...(options.sleep ? { sleep: options.sleep } : {}),
    ...(options.subjects?.newId ? { newId: options.subjects.newId } : {}),
  });

  async function handle(userId: string, body: unknown): Promise<AiResponse> {
    const req = aiRequestSchema.safeParse(body);
    if (!req.success) return { status: 400, body: { error: 'The request was not understood.', issues: req.error.issues.map((i) => i.message) } };
    try {
      if (req.data.action === 'usage') return { status: 200, body: { usage: await usage(userId), configured: provider !== null, origin: provider?.origin ?? null } };
      if (req.data.action === 'advise') return await advise(userId, req.data);
      if (req.data.action === 'research') return await research(userId, req.data);
      if (req.data.action === 'create_subject') return await subjects.create(userId, req.data.request);
      if (req.data.action === 'build_lesson') return await subjects.build(userId, req.data.templateId);
      if (req.data.action === 'narrate_scene') return await narrateScene(userId, req.data);
      if (req.data.action === 'plan_boss') return await planBoss(userId, req.data);
      return await askTutor(userId, req.data);
    } catch (err) {
      if (err instanceof z.ZodError) return { status: 500, body: { error: 'The game data came back in an unexpected shape. Please try again later.' } };
      return { status: 500, body: { error: failureMessage.internal.error } };
    }
  }

  return { handle };
}
