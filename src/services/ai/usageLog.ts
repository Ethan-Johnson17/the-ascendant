import { z } from 'zod';
import { StoreError, type LearningStore } from '../learning/learningService.ts';
import type { AiConfig } from './config.ts';
import type { AiOrigin, AiRole, AiUsage } from './types.ts';

/**
 * Counting and logging AI requests, shared by every role. A request is reserved (counted against
 * the player's limits, atomically) before the provider is called, and finished afterwards with its
 * outcome and token counts. Prompts and answers are never stored.
 */

const reserveSchema = z.object({ requestId: z.uuid(), usedToday: z.number().int() });
const usageSchema = z.object({ usedToday: z.number().int(), oldestAt: z.string().nullable() });

export interface UsageSummary {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  /** When one more request becomes available, if none are left. */
  readonly nextFreeAt: string | null;
}

export type Reservation = { ok: true; requestId: string; usedToday: number } | { ok: false; code: 'daily_limit' | 'minute_limit' };

export interface FinishMeta {
  readonly origin: AiOrigin | null;
  readonly usage: AiUsage;
  readonly attempts: number;
  readonly model: string | null;
  readonly errorKind: string | null;
  /** Why a repair attempt was needed (field paths and codes only). */
  readonly repairReason?: string | null;
}

export function createUsageLog(store: LearningStore, providerId: string | null, config: AiConfig, now: () => Date) {
  async function usage(userId: string): Promise<UsageSummary> {
    const u = usageSchema.parse(await store.call('ai_usage', { p_user_id: userId, p_now: now().toISOString() }));
    return {
      used: u.usedToday,
      limit: config.dailyRequestsPerPlayer,
      remaining: Math.max(0, config.dailyRequestsPerPlayer - u.usedToday),
      // When the oldest request in the window stops counting, one more becomes available.
      nextFreeAt: u.usedToday >= config.dailyRequestsPerPlayer && u.oldestAt ? new Date(new Date(u.oldestAt).getTime() + 24 * 3600_000).toISOString() : null,
    };
  }

  async function reserve(userId: string, role: AiRole, campaignId: string | null, minuteLimit = config.requestsPerMinute): Promise<Reservation> {
    try {
      const r = reserveSchema.parse(
        await store.call('ai_reserve_request', {
          p_user_id: userId,
          p_role: role,
          p_campaign_id: campaignId,
          p_now: now().toISOString(),
          p_daily_limit: config.dailyRequestsPerPlayer,
          p_minute_limit: minuteLimit,
        }),
      );
      return { ok: true, requestId: r.requestId, usedToday: r.usedToday };
    } catch (err) {
      if (err instanceof StoreError && err.code === 'AL001') return { ok: false, code: 'daily_limit' };
      if (err instanceof StoreError && err.code === 'AL002') return { ok: false, code: 'minute_limit' };
      throw err;
    }
  }

  const finish = (userId: string, requestId: string, status: 'ok' | 'failed', meta: FinishMeta) =>
    store.call('ai_finish_request', {
      p_user_id: userId,
      p_request_id: requestId,
      p_status: status,
      p_origin: meta.origin,
      p_provider: providerId,
      p_model: meta.model,
      p_input_tokens: meta.usage.inputTokens,
      p_output_tokens: meta.usage.outputTokens,
      p_attempts: meta.attempts,
      p_error_kind: meta.errorKind,
      p_repair_reason: meta.repairReason ?? null,
    });

  return { usage, reserve, finish };
}
export type UsageLog = ReturnType<typeof createUsageLog>;
