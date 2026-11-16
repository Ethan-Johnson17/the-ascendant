import { z } from 'zod';
import { StoreError, type LearningStore } from '../learning/learningService.ts';
import { defaultAiConfig, type AiConfig } from './config.ts';
import { runStructured } from './structured.ts';
import { AiError, noUsage, type AiOrigin, type AiProvider, type AiUsage } from './types.ts';
import { buildTutorMessages, checkCitations, tutorAnswerSchema, tutorMaterialSchema, type TutorMaterial } from './roles/tutor.ts';

/**
 * The server side of AI features: what the `ai` Edge Function runs for each request.
 *
 *   1. load the material the role may use      (service-role SQL, ai_*_context)
 *   2. count the request against the limits     (ai_reserve_request, atomic)
 *   3. call the provider; accept only replies that pass the schema (one repair attempt)
 *   4. check citations against known sources
 *   5. log the outcome                          (ai_finish_request; tokens, never text)
 *
 * The AI never changes game state here: the Tutor only explains. Runs unchanged in Node (tests,
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
}

const reserveSchema = z.object({ requestId: z.uuid(), usedToday: z.number().int() });
const usageSchema = z.object({ usedToday: z.number().int(), oldestAt: z.string().nullable() });

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

/**
 * @param provider `null` when no AI provider is configured: requests then fail clearly with
 *   `not_configured` and are not counted against the player's limit.
 */
export function createAiService(store: LearningStore, provider: AiProvider | null, options: AiServiceOptions = {}) {
  const now = options.now ?? (() => new Date());
  const config = options.config ?? defaultAiConfig;

  const usage = async (userId: string) => {
    const at = now();
    const u = usageSchema.parse(await store.call('ai_usage', { p_user_id: userId, p_now: at.toISOString() }));
    return {
      used: u.usedToday,
      limit: config.dailyRequestsPerPlayer,
      remaining: Math.max(0, config.dailyRequestsPerPlayer - u.usedToday),
      // When the oldest request in the window stops counting, one more becomes available.
      nextFreeAt: u.usedToday >= config.dailyRequestsPerPlayer && u.oldestAt ? new Date(new Date(u.oldestAt).getTime() + 24 * 3600_000).toISOString() : null,
    };
  };

  const finish = (userId: string, requestId: string, status: 'ok' | 'failed', meta: { origin: AiOrigin | null; usage: AiUsage; attempts: number; model: string | null; errorKind: string | null }) =>
    store.call('ai_finish_request', {
      p_user_id: userId,
      p_request_id: requestId,
      p_status: status,
      p_origin: meta.origin,
      p_provider: provider?.id ?? null,
      p_model: meta.model,
      p_input_tokens: meta.usage.inputTokens,
      p_output_tokens: meta.usage.outputTokens,
      p_attempts: meta.attempts,
      p_error_kind: meta.errorKind,
    });

  async function askTutor(userId: string, req: Extract<z.infer<typeof aiRequestSchema>, { action: 'ask_tutor' }>): Promise<AiResponse> {
    const raw = await store.call('ai_tutor_context', { p_user_id: userId, p_campaign_id: req.campaignId, p_activity_id: req.lessonId });
    if (raw === null) return { status: 404, body: { error: 'That lesson was not found in this campaign.' } };
    const material: TutorMaterial = tutorMaterialSchema.parse(raw);
    if (!provider) return { status: failureMessage.not_configured.status, body: { error: failureMessage.not_configured.error, code: 'not_configured' } };

    let reservation: z.infer<typeof reserveSchema>;
    try {
      reservation = reserveSchema.parse(
        await store.call('ai_reserve_request', {
          p_user_id: userId,
          p_role: 'tutor',
          p_campaign_id: req.campaignId,
          p_now: now().toISOString(),
          p_daily_limit: config.dailyRequestsPerPlayer,
          p_minute_limit: config.requestsPerMinute,
        }),
      );
    } catch (err) {
      if (err instanceof StoreError && err.code === 'AL001') {
        return { status: 429, body: { error: `You’ve used all ${config.dailyRequestsPerPlayer} Tutor questions for today. Lessons, checks and the Codex still work.`, code: 'daily_limit', usage: await usage(userId) } };
      }
      if (err instanceof StoreError && err.code === 'AL002') return { status: 429, body: { error: 'That’s a lot of questions in one minute. Take a breath and try again shortly.', code: 'minute_limit' } };
      throw err;
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
      await finish(userId, reservation.requestId, 'ok', { origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: null });
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
      await finish(userId, reservation.requestId, 'failed', { origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model, errorKind: kind });
      if (kind === 'internal') throw err;
      const f = failureMessage[kind];
      return { status: f.status, body: { error: f.error, code: kind } };
    }
  }

  async function handle(userId: string, body: unknown): Promise<AiResponse> {
    const req = aiRequestSchema.safeParse(body);
    if (!req.success) return { status: 400, body: { error: 'The request was not understood.', issues: req.error.issues.map((i) => i.message) } };
    try {
      if (req.data.action === 'usage') return { status: 200, body: { usage: await usage(userId), configured: provider !== null, origin: provider?.origin ?? null } };
      return await askTutor(userId, req.data);
    } catch (err) {
      if (err instanceof z.ZodError) return { status: 500, body: { error: 'The game data came back in an unexpected shape. Please try again later.' } };
      return { status: 500, body: { error: failureMessage.internal.error } };
    }
  }

  return { handle };
}
