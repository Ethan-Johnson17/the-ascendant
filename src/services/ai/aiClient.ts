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

const checkSchema = z.object({ name: z.string(), passed: z.boolean(), detail: z.string() });

/** A suggestion that passed every automated check (the server never returns the others). */
const readingSchema = z.object({
  kind: z.enum(['web', 'book', 'article']),
  title: z.string(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  url: z.string().nullable(),
  doi: z.string().nullable(),
  why: z.string().nullable(),
  status: z.literal('verified'),
  publisherKind: z.string().nullable(),
  checks: z.array(checkSchema),
});
export type ReadingView = z.infer<typeof readingSchema>;

const researchReplySchema = z.object({
  results: z.array(readingSchema).max(6),
  suggested: z.number().int(),
  hidden: z.number().int(),
  origin: z.enum(['ai', 'fixture']),
  usage: usageSchema,
});
export type ResearchReply = z.infer<typeof researchReplySchema>;

/** What the Codex shows for one concept: the last search and its verified results. */
export interface FurtherReading {
  readonly results: readonly ReadingView[];
  readonly lastRun: { readonly at: Date; readonly origin: 'ai' | 'fixture'; readonly suggested: number; readonly verified: number } | null;
}

const createSubjectReplySchema = z.object({
  templateId: z.string(),
  campaignId: z.string(),
  title: z.string(),
  origin: z.enum(['ai', 'fixture']),
  adviceArea: z.enum(['none', 'health', 'law', 'money']),
  usage: usageSchema,
});
export type CreateSubjectReply = z.infer<typeof createSubjectReplySchema>;

const buildLessonReplySchema = z.object({
  lessonKey: z.string(),
  activityId: z.string(),
  origin: z.enum(['ai', 'fixture']),
  droppedParts: z.number().int(),
  droppedQuestions: z.number().int(),
  usage: usageSchema,
});
export type BuildLessonReply = z.infer<typeof buildLessonReplySchema>;
const deepenReplySchema = z.object({ activityId: z.string(), stage: z.number().int(), origin: z.enum(['ai', 'fixture']), droppedQuestions: z.number().int(), usage: usageSchema });
export type DeepenReply = z.infer<typeof deepenReplySchema>;

/** The Game Master's checked scene (no screen yet; quests use it in Phase 5). */
const sceneReplySchema = z.object({
  scene: z.object({
    narration: z.array(z.string()).min(1),
    dialogue: z.array(z.object({ npcId: z.string(), name: z.string(), line: z.string() })),
    choices: z.array(z.object({ actionId: z.string(), label: z.string() })).min(1),
    removed: z.number().int(),
  }),
  origin: z.enum(['ai', 'fixture']),
  usage: usageSchema,
});
export type SceneReply = z.infer<typeof sceneReplySchema>;

/** The Strategist's boss plan, allowed by the engine. Question ids only, never answers. */
const bossReplySchema = z.object({
  boss: z.object({
    name: z.string(),
    epithet: z.string(),
    intro: z.array(z.string()).min(1),
    rounds: z.array(z.object({ competencyId: z.string(), competencyName: z.string(), title: z.string(), narration: z.string().nullable(), questionIds: z.array(z.string()).min(1) })).min(1),
    victory: z.string(),
    defeat: z.string(),
    removed: z.number().int(),
  }),
  origin: z.enum(['ai', 'fixture']),
  usage: usageSchema,
});
export type BossPlanReply = z.infer<typeof bossReplySchema>;

const questStoryReplySchema = z.object({
  story: z.object({
    narration: z.array(z.string()).min(1),
    dialogue: z.array(z.object({ npcId: z.string(), name: z.string(), line: z.string() })),
    choices: z.array(z.object({ actionId: z.string(), label: z.string() })),
    removed: z.number().int(),
    origin: z.enum(['ai', 'fixture']),
  }),
  saved: z.boolean(),
  usage: usageSchema.optional(),
});
export type QuestStoryReply = z.infer<typeof questStoryReplySchema>;

export interface NewSubjectRequest {
  readonly subject: string;
  readonly objective: string;
  readonly startingProficiency: 'none' | 'beginner' | 'intermediate' | 'advanced';
}

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

const rowSchema = z.object({
  kind: z.enum(['web', 'book', 'article']), title: z.string(), author: z.string().nullable(), publisher: z.string().nullable(), year: z.number().int().nullable(),
  url: z.string().nullable(), doi: z.string().nullable(), why: z.string().nullable(), status: z.literal('verified'), publisher_kind: z.string().nullable(), checks: z.array(checkSchema),
});
const runSchema = z.object({ created_at: z.string(), origin: z.enum(['ai', 'fixture']), suggested: z.number().int(), verified: z.number().int() });

/** Reads the player's own further reading for a concept (Row Level Security limits it to them). */
async function loadFurtherReading(db: SupabaseClient, campaignId: string, conceptId: string): Promise<FurtherReading> {
  const [rows, runs] = await Promise.all([
    db.from('research_results').select('kind, title, author, publisher, year, url, doi, why, status, publisher_kind, checks')
      .eq('campaign_id', campaignId).eq('concept_id', conceptId).eq('status', 'verified').order('created_at'),
    db.from('research_runs').select('created_at, origin, suggested, verified')
      .eq('campaign_id', campaignId).eq('concept_id', conceptId).order('created_at', { ascending: false }).limit(1),
  ]);
  if (rows.error || runs.error) throw new Error('Couldn’t load further reading.');
  const results = z.array(rowSchema).parse(rows.data).map(({ publisher_kind, ...r }) => ({ ...r, publisherKind: publisher_kind }));
  const run = z.array(runSchema).parse(runs.data)[0];
  return { results, lastRun: run ? { at: new Date(run.created_at), origin: run.origin, suggested: run.suggested, verified: run.verified } : null };
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
    /** Asks the Researcher for further reading on one Codex concept; the server checks every suggestion. */
    research: (campaignId: string, conceptId: string) => call(db, { action: 'research', campaignId, conceptId }, researchReplySchema),
    furtherReading: (campaignId: string, conceptId: string) => loadFurtherReading(db, campaignId, conceptId),
    /** Plans a new subject (1 AI request) and starts its campaign. */
    createSubject: (request: NewSubjectRequest) => call(db, { action: 'create_subject', request }, createSubjectReplySchema),
    /** Builds the next lesson and its check of one of the player's subjects (2 AI requests). */
    buildLesson: (templateId: string) => call(db, { action: 'build_lesson', templateId }, buildLessonReplySchema),
    /** "Go deeper": writes the next harder check for a lesson (1 AI request). */
    deepenLesson: (templateId: string, lessonKey: string) => call(db, { action: 'deepen_lesson', templateId, lessonKey }, deepenReplySchema),
    /** The Game Master narrates the preview scene (1 AI request; changes nothing). For Phase 5 quests. */
    narrateScene: (campaignId: string, message: string | null = null, history: readonly { player: string; narration: string }[] = []) =>
      call(db, { action: 'narrate_scene', campaignId, message, history }, sceneReplySchema),
    /** The Strategist proposes a boss from the course's checked questions (1 AI request; nothing saved). For Phase 5. */
    planBoss: (campaignId: string) => call(db, { action: 'plan_boss', campaignId }, bossReplySchema),
    /** The Game Master tells a quest's story (1 AI request the first time; saved afterwards). */
    narrateQuest: (campaignId: string, questKey: string) => call(db, { action: 'narrate_quest', campaignId, questKey }, questStoryReplySchema),
  };
}
export type AiClient = ReturnType<typeof createAiClient>;
