import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { answerSchema, type Answer } from '../../engine/learning/grading.ts';
import { errorCategories } from '../../engine/learning/config.ts';

/**
 * Browser side of the `learning` Edge Function. Sends the player's actions; never decides an
 * outcome. Every response is validated before the screens use it.
 */

const entry = z.object({ key: z.string(), text: z.string() });
export const issuedItemSchema = z.discriminatedUnion('kind', [
  z.object({ key: z.string(), kind: z.literal('single_choice'), difficulty: z.number(), prompt: z.string(), options: z.array(entry) }),
  z.object({ key: z.string(), kind: z.literal('ordering'), difficulty: z.number(), prompt: z.string(), entries: z.array(entry) }),
  z.object({ key: z.string(), kind: z.literal('matching'), difficulty: z.number(), prompt: z.string(), left: z.array(entry), right: z.array(entry) }),
  z.object({ key: z.string(), kind: z.literal('written'), difficulty: z.number(), prompt: z.string(), maxChars: z.number().int().min(1) }),
]);
export type IssuedItem = z.infer<typeof issuedItemSchema>;

const startSchema = z.object({ attemptId: z.string(), startedAt: z.string(), difficulty: z.number().int().min(1).max(3), items: z.array(issuedItemSchema).min(1) });
export type StartedCheck = z.infer<typeof startSchema>;

const resultSchema = z.object({
  correct: z.number(),
  total: z.number(),
  score: z.number(),
  passed: z.boolean(),
  /** False when a written answer couldn't be marked confidently: nothing changed. */
  counted: z.boolean().default(true),
  /** 'fixture' when a development stand-in marked written answers; null when none were marked. */
  examinerOrigin: z.enum(['ai', 'fixture']).nullable().default(null),
  results: z.array(
    z.object({
      itemId: z.string(),
      conceptId: z.string(),
      correct: z.boolean(),
      errorCategory: z.enum(errorCategories).nullable(),
      given: answerSchema.nullable(),
      answer: answerSchema,
      explanation: z.string(),
      written: z
        .object({
          criteria: z.array(z.object({ key: z.string(), description: z.string(), points: z.number(), met: z.boolean(), quote: z.string() })),
          earned: z.number(),
          required: z.number(),
          total: z.number(),
          feedback: z.string().nullable(),
          confident: z.boolean(),
          marked: z.boolean(),
        })
        .optional(),
    }),
  ),
  competencies: z.array(
    z.object({
      competencyId: z.string(),
      previousStage: z.number(),
      stage: z.number(),
      advanced: z.boolean(),
      progress: z.object({ spacedPasses: z.number(), passesRequired: z.number(), reason: z.string().nullable() }),
      reviewedWhileDue: z.boolean(),
    }),
  ),
  weaknesses: z.array(z.object({ conceptId: z.string(), event: z.string(), status: z.enum(['open', 'resolved']) })),
  xp: z.object({ total: z.number(), awards: z.array(z.object({ kind: z.string(), amount: z.number() })) }),
});
export type CheckResult = z.infer<typeof resultSchema>;

const lessonSchema = z.object({ completed: z.literal(true), firstCompletion: z.boolean(), xp: z.object({ total: z.number() }) });
export type LessonResult = z.infer<typeof lessonSchema>;

const storyView = z.object({
  narration: z.array(z.string()).min(1),
  dialogue: z.array(z.object({ npcId: z.string(), name: z.string(), line: z.string() })),
  choices: z.array(z.object({ actionId: z.string(), label: z.string() })),
  removed: z.number().int(),
  origin: z.enum(['ai', 'fixture']),
});
export type QuestStoryView = z.infer<typeof storyView>;

const link = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lesson'), activityId: z.string() }),
  z.object({ kind: z.literal('check'), activityId: z.string() }),
  z.object({ kind: z.literal('weaknesses') }),
  z.object({ kind: z.literal('campaign') }),
]);
const questView = z.object({
  key: z.string(),
  kind: z.enum(['learn', 'deepen', 'prepare', 'review', 'retention', 'recover']),
  title: z.string(),
  summary: z.string(),
  competencyIds: z.array(z.string()),
  difficulty: z.number().int().min(1).max(3),
  objectives: z.array(z.object({ id: z.string(), label: z.string(), done: z.boolean(), link })),
  hints: z.array(z.string()),
  xp: z.number().int(),
  status: z.enum(['locked', 'active', 'ready', 'completed']),
  lockedReason: z.string().nullable(),
  story: storyView.nullable(),
});
export type QuestView = z.infer<typeof questView>;
const questsSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  quests: z.array(questView),
  newlyCompleted: z.array(z.object({ key: z.string(), title: z.string(), xp: z.number().int() })),
});
export type QuestList = z.infer<typeof questsSchema>;

const bossStatusView = z.discriminatedUnion('status', [
  z.object({ stage: z.number().int(), status: z.literal('won') }),
  z.object({ stage: z.number().int(), status: z.literal('active'), encounterId: z.string() }),
  z.object({ stage: z.number().int(), status: z.literal('ready') }),
  z.object({ stage: z.number().int(), status: z.literal('locked'), reason: z.string() }),
  z.object({
    stage: z.number().int(), status: z.literal('recover'),
    recovery: z.object({ losses: z.number().int(), steps: z.array(z.object({ conceptId: z.string(), concept: z.string(), checkId: z.string(), done: z.boolean() })) }),
  }),
]);
export type BossStatusView = z.infer<typeof bossStatusView>;
const bossListSchema = z.object({ campaignStatus: z.enum(['active', 'paused', 'completed']), bosses: z.array(bossStatusView) });
export type BossList = z.infer<typeof bossListSchema>;

const battleSchema = z.object({
  encounter: z.object({
    id: z.string(), campaignId: z.string(), stage: z.number().int(), status: z.enum(['active', 'won', 'lost']),
    resolve: z.number().int(), maxResolve: z.number().int(), position: z.number().int(), total: z.number().int(),
    plan: z.object({
      name: z.string(), epithet: z.string(), intro: z.array(z.string()),
      rounds: z.array(z.object({ competencyId: z.string(), competencyName: z.string(), title: z.string(), narration: z.string().nullable(), questionIds: z.array(z.string()) })),
      victory: z.string().nullable(), defeat: z.string().nullable(), removed: z.number().int(),
    }),
    planOrigin: z.enum(['ai', 'fixture', 'game']),
    answered: z.array(z.object({ itemId: z.string(), correct: z.boolean() })),
  }),
  question: issuedItemSchema.nullable(),
});
export type BattleView = z.infer<typeof battleSchema>;
const answerResultSchema = battleSchema.extend({
  result: z.object({ correct: z.boolean(), answer: answerSchema, explanation: z.string(), weakness: z.string().nullable(), xp: z.number().int() }),
});
export type BossAnswerResult = z.infer<typeof answerResultSchema>;

export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(db: SupabaseClient, body: Record<string, unknown>, schema: z.ZodType<T>): Promise<Outcome<T>> {
  try {
    const { data, error } = await db.functions.invoke('learning', { body });
    if (error) {
      // FunctionsHttpError carries the function's own JSON reply in `context`.
      const ctx = (error as { context?: Response }).context;
      let msg: string | null = null;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const parsed = z.object({ error: z.string() }).safeParse(await ctx.json());
          if (parsed.success) msg = parsed.data.error;
        } catch {
          /* not JSON */
        }
      }
      return { ok: false, error: msg ?? 'Couldn’t reach the learning service. Check your connection and try again.' };
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) return { ok: false, error: 'The learning service replied in an unexpected shape. Please try again later.' };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: 'Couldn’t reach the learning service. Check your connection and try again.' };
  }
}

export function createLearningClient(db: SupabaseClient) {
  return {
    startCheck: (campaignId: string, activityId: string) => call(db, { action: 'start_check', campaignId, activityId }, startSchema),
    submitCheck: (attemptId: string, answers: Record<string, Answer>) => call(db, { action: 'submit_check', attemptId, answers }, resultSchema),
    completeLesson: (campaignId: string, activityId: string) => call(db, { action: 'complete_lesson', campaignId, activityId }, lessonSchema),
    /** The campaign's quests; quests the player has just finished are completed (with XP) by the server. */
    listQuests: (campaignId: string) => call(db, { action: 'list_quests', campaignId }, questsSchema),
    /** Each boss's status for this player (the server decides). */
    listBosses: (campaignId: string) => call(db, { action: 'list_bosses', campaignId }, bossListSchema),
    /** Starts (or resumes) a battle. */
    startBoss: (campaignId: string, stage: number) => call(db, { action: 'start_boss', campaignId, stage }, battleSchema),
    viewBoss: (encounterId: string) => call(db, { action: 'view_boss', encounterId }, battleSchema),
    /** Answers the current question; the correct answer comes back only after marking. */
    answerBoss: (encounterId: string, position: number, answer: Answer | null) => call(db, { action: 'answer_boss', encounterId, position, answer }, answerResultSchema),
  };
}
export type LearningClient = ReturnType<typeof createLearningClient>;
