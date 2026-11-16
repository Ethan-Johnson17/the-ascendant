import type { WrittenItem } from '../../engine/learning/curriculum.ts';
import type { WrittenMark } from '../../engine/learning/grading.ts';
import type { LearningStore } from '../learning/learningService.ts';
import { defaultAiConfig, type AiConfig } from './config.ts';
import { buildExaminerMessages, checkJudgement, examinerJudgementSchema, type CheckedJudgement } from './roles/examiner.ts';
import { runStructured } from './structured.ts';
import { AiError, noUsage, type AiOrigin, type AiProvider } from './types.ts';
import { createUsageLog } from './usageLog.ts';

/**
 * Marks written answers for the `learning` Edge Function. One AI request per written answer, each
 * counted against the player's daily limit. The Examiner only judges; the engine marks
 * (src/engine/learning/grading.ts) and decides whether the attempt counts.
 */

export interface WrittenJob {
  readonly item: WrittenItem;
  readonly answer: string;
}

export interface ExaminerMarking {
  readonly origin: AiOrigin;
  readonly provider: string;
  readonly model: string;
  /** Checked judgements by item key. */
  readonly items: Readonly<Record<string, CheckedJudgement>>;
}

export type ExaminerResult =
  | { readonly ok: true; readonly marks: Readonly<Record<string, WrittenMark>>; readonly marking: ExaminerMarking }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly code: string };

export interface Examiner {
  /** Whether the Examiner can mark `needed` written answers for this player right now. */
  available(userId: string, needed: number): Promise<boolean>;
  mark(userId: string, campaignId: string, jobs: readonly WrittenJob[]): Promise<ExaminerResult>;
}

/** Player-facing wording. On any failure nothing is recorded, so the player can submit again. */
const failure: Record<AiError['kind'] | 'daily_limit' | 'minute_limit', { status: number; error: string }> = {
  not_configured: { status: 503, error: 'The Examiner isn’t set up on this server, so written answers can’t be marked.' },
  timeout: { status: 504, error: 'The Examiner took too long to mark your written answer. Your answers are still here: please submit again.' },
  rate_limited: { status: 503, error: 'The Examiner is resting: the shared free AI allowance is used up for now. Your answers are still here: please try again later.' },
  unavailable: { status: 503, error: 'The Examiner can’t be reached right now. Your answers are still here: please submit again in a moment.' },
  bad_output: { status: 502, error: 'The Examiner’s marking came back garbled, so it wasn’t used. Your answers are still here: please submit again.' },
  refused: { status: 422, error: 'The Examiner couldn’t mark that written answer. Try rewording it and submit again.' },
  daily_limit: { status: 429, error: 'You’ve used all of today’s AI requests, so written answers can’t be marked until some free up.' },
  minute_limit: { status: 429, error: 'That’s a lot of AI requests in one minute. Wait a moment, then submit again.' },
};

export interface ExaminerOptions {
  readonly now?: () => Date;
  readonly config?: AiConfig;
  readonly sleep?: (ms: number) => Promise<void>;
}

export function createExaminer(store: LearningStore, provider: AiProvider | null, options: ExaminerOptions = {}): Examiner {
  const now = options.now ?? (() => new Date());
  const config = options.config ?? defaultAiConfig;
  const log = createUsageLog(store, provider?.id ?? null, config, now);
  const fail = (code: keyof typeof failure): ExaminerResult => ({ ok: false, code, ...failure[code] });

  async function available(userId: string, needed: number): Promise<boolean> {
    if (!provider) return false;
    return (await log.usage(userId)).remaining >= needed;
  }

  async function markOne(userId: string, requestId: string, job: WrittenJob): Promise<CheckedJudgement> {
    try {
      const result = await runStructured(
        provider!,
        {
          role: 'examiner',
          schemaName: 'examiner_judgement',
          messages: buildExaminerMessages(job.item, job.answer),
          maxOutputTokens: config.maxOutputTokens.examiner ?? 1500,
          temperature: 0,
          fixtureHint: { item: job.item, answer: job.answer },
        },
        examinerJudgementSchema,
        { transientRetries: config.transientRetries, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      await log.finish(userId, requestId, 'ok', { origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: null });
      return checkJudgement(job.item, job.answer, result.data);
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'internal';
      await log.finish(userId, requestId, 'failed', { origin: provider!.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider!.model, errorKind: kind });
      throw err;
    }
  }

  async function mark(userId: string, campaignId: string, jobs: readonly WrittenJob[]): Promise<ExaminerResult> {
    if (jobs.length === 0) return { ok: true, marks: {}, marking: { origin: provider?.origin ?? 'ai', provider: provider?.id ?? 'none', model: provider?.model ?? 'none', items: {} } };
    if (!provider) return fail('not_configured');
    // Check the allowance first so a check never spends some requests and then stops halfway.
    if ((await log.usage(userId)).remaining < jobs.length) return fail('daily_limit');

    const reservations: string[] = [];
    for (const _ of jobs) {
      // One check's written answers are marked together, so they get their own room in the minute limit.
      const r = await log.reserve(userId, 'examiner', campaignId, config.requestsPerMinute + jobs.length);
      if (!r.ok) {
        for (const id of reservations) await log.finish(userId, id, 'failed', { origin: provider.origin, usage: noUsage, attempts: 0, model: provider.model, errorKind: 'internal' });
        return fail(r.code);
      }
      reservations.push(r.requestId);
    }

    try {
      const judged = await Promise.all(jobs.map((job, i) => markOne(userId, reservations[i]!, job)));
      const items: Record<string, CheckedJudgement> = {};
      const marks: Record<string, WrittenMark> = {};
      jobs.forEach((job, i) => {
        items[job.item.key] = judged[i]!;
        marks[job.item.key] = judged[i]!.mark;
      });
      return { ok: true, marks, marking: { origin: provider.origin, provider: provider.id, model: provider.model, items } };
    } catch (err) {
      if (err instanceof AiError) return fail(err.kind);
      throw err;
    }
  }

  return { available, mark };
}
