import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Browser-side caller for the `ai` Edge Function. (The rest of src/services/ai is server code.)
 * Every reply is validated before the app shows it.
 */

const usageSchema = z.object({ used: z.number().int(), limit: z.number().int(), remaining: z.number().int(), nextFreeAt: z.string().nullable().optional() });
export type AiUsageView = z.infer<typeof usageSchema>;

const tutorReplySchema = z.object({
  answer: z.object({
    status: z.enum(['answered', 'partly_covered', 'not_covered', 'off_topic']),
    paragraphs: z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()), supported: z.boolean() })).min(1),
    followUps: z.array(z.string()),
    removedCitations: z.number().int(),
  }),
  origin: z.enum(['ai', 'fixture']),
  usage: usageSchema,
});
export type TutorReply = z.infer<typeof tutorReplySchema>;

const adviceReplySchema = z.object({
  advice: z.object({ summary: z.string(), steps: z.array(z.object({ activityId: z.string(), why: z.string() })).min(1) }),
  origin: z.enum(['ai', 'fixture']),
  usage: usageSchema,
});
export type AdviceReply = z.infer<typeof adviceReplySchema>;

const statusSchema = z.object({ usage: usageSchema, configured: z.boolean(), origin: z.enum(['ai', 'fixture']).nullable() });
export type AiStatus = z.infer<typeof statusSchema>;

export type AiOutcome<T> = { ok: true; data: T } | { ok: false; error: string; code: string | null; usage: AiUsageView | null };

const unreachable = 'Couldn’t reach the AI service. Check your connection and try again.';

async function call<T>(db: SupabaseClient, body: Record<string, unknown>, schema: z.ZodType<T>): Promise<AiOutcome<T>> {
  try {
    const { data, error } = await db.functions.invoke('ai', { body });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const parsed = z.object({ error: z.string(), code: z.string().optional(), usage: usageSchema.optional() }).safeParse(await ctx.json());
          if (parsed.success) return { ok: false, error: parsed.data.error, code: parsed.data.code ?? null, usage: parsed.data.usage ?? null };
        } catch {
          /* not JSON */
        }
      }
      return { ok: false, error: unreachable, code: null, usage: null };
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) return { ok: false, error: 'The AI service replied in an unexpected shape, so it wasn’t shown. Please try again.', code: 'bad_shape', usage: null };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: unreachable, code: null, usage: null };
  }
}

export interface TutorTurnInput {
  readonly question: string;
  readonly answer: string;
}

export function createAiClient(db: SupabaseClient) {
  return {
    status: () => call(db, { action: 'usage' }, statusSchema),
    askTutor: (campaignId: string, lessonId: string, question: string, history: readonly TutorTurnInput[]) =>
      call(db, { action: 'ask_tutor', campaignId, lessonId, question, history }, tutorReplySchema),
    /** Asks the Advisor to explain the engine's plan. Sends only step kinds and activity ids. */
    advise: (campaignId: string, steps: readonly { kind: string; activityId: string }[]) =>
      call(db, { action: 'advise', campaignId, steps: steps.map((s) => ({ kind: s.kind, activityId: s.activityId })) }, adviceReplySchema),
  };
}
export type AiClient = ReturnType<typeof createAiClient>;
