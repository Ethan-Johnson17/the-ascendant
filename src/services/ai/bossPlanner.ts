import type { LearningStore } from '../learning/learningService.ts';
import type { BossPlanner } from '../bosses/bossService.ts';
import { defaultAiConfig, type AiConfig } from './config.ts';
import { buildStrategistMessages, checkStrategy, strategistReplySchema } from './roles/strategist.ts';
import { runStructured } from './structured.ts';
import { AiError, noUsage, type AiProvider } from './types.ts';
import { createUsageLog } from './usageLog.ts';

/**
 * The Strategist for real boss battles (runs in the `learning` Edge Function). One AI request per
 * battle, counted against the player's daily limit. Any failure returns null and the game uses its
 * own plan, so a battle never waits on the AI.
 */
export function createBossPlanner(store: LearningStore, provider: AiProvider | null, options: { now?: () => Date; config?: AiConfig; sleep?: (ms: number) => Promise<void> } = {}): BossPlanner | null {
  if (!provider) return null;
  const config = options.config ?? defaultAiConfig;
  const log = createUsageLog(store, provider.id, config, options.now ?? (() => new Date()));

  return async (userId, campaignId, ctx) => {
    const reservation = await log.reserve(userId, 'strategist', campaignId);
    if (!reservation.ok) return null;
    try {
      const result = await runStructured(
        provider,
        { role: 'strategist', schemaName: 'strategist_boss', messages: buildStrategistMessages(ctx), maxOutputTokens: config.maxOutputTokens.strategist ?? 1500, temperature: 0.7, fixtureHint: { context: ctx } },
        strategistReplySchema,
        { transientRetries: config.transientRetries, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      const checked = checkStrategy(result.data, ctx);
      const broke = !('plan' in checked);
      await log.finish(userId, reservation.requestId, broke ? 'failed' : 'ok', {
        origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: broke ? 'bad_output' : null,
        repairReason: broke ? `plan: ${checked.problems.join(',')}`.slice(0, 300) : result.repairReason,
      });
      return 'plan' in checked ? { plan: checked.plan, origin: result.origin } : null;
    } catch (err) {
      await log.finish(userId, reservation.requestId, 'failed', {
        origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model,
        errorKind: err instanceof AiError ? err.kind : 'internal', repairReason: err instanceof AiError ? err.repairReason : null,
      });
      return null;
    }
  };
}
