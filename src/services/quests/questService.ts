import { z } from 'zod';
import { buildQuests, questsToComplete, recoveryQuests, type Quest, type QuestCourse, type QuestRecords } from '../../engine/quests/quests.ts';
import { bossStages, recoveryFor, testedCompetencies } from '../../engine/encounters/boss.ts';
import { loadBossContext, toBossCourse, toBossRecords } from '../bosses/bossService.ts';
import type { LearningStore } from '../learning/learningService.ts';

/**
 * Server side of quests, shared by the `learning` function (listing and completing) and the `ai`
 * function (quest stories). The engine builds the quests from `quest_context`; completions are
 * recorded only when the engine finds every objective met in the player's real records.
 */

const activity = z.object({
  id: z.string(),
  kind: z.enum(['lesson', 'assessment']),
  title: z.string(),
  targetStage: z.number().int().nullable(),
  competencyIds: z.array(z.string()),
});

export const storySchema = z.object({
  narration: z.array(z.string()).min(1),
  dialogue: z.array(z.object({ npcId: z.string(), name: z.string(), line: z.string() })),
  choices: z.array(z.object({ actionId: z.string(), label: z.string() })),
  removed: z.number().int(),
});
export type QuestStory = z.infer<typeof storySchema>;

export const questContextSchema = z.object({
  campaignStatus: z.enum(['active', 'paused', 'completed']),
  campaignTitle: z.string(),
  competencies: z.array(z.object({ id: z.string(), name: z.string() })),
  objectives: z.array(z.object({ id: z.string(), key: z.string(), title: z.string(), topic: z.string(), activities: z.array(activity) })),
  records: z.object({
    completedLessonIds: z.array(z.string()),
    passedCheckIds: z.array(z.string()),
    resolvedWeaknesses: z.number().int(),
    openWeaknesses: z.number().int(),
    reviewsPassed: z.number().int(),
    stages: z.array(z.object({ competencyId: z.string(), stage: z.number().int() })),
    completedQuestKeys: z.array(z.string()),
  }),
  stories: z.array(z.object({ questKey: z.string(), story: storySchema, origin: z.enum(['ai', 'fixture']) })),
});
export type QuestContext = z.infer<typeof questContextSchema>;

export function toCourse(campaignId: string, ctx: QuestContext): QuestCourse {
  return { campaignId, competencies: ctx.competencies, objectives: ctx.objectives };
}

export function toRecords(ctx: QuestContext, extraCompleted: readonly string[] = []): QuestRecords {
  const r = ctx.records;
  return {
    completedLessonIds: new Set(r.completedLessonIds),
    passedCheckIds: new Set(r.passedCheckIds),
    resolvedWeaknesses: r.resolvedWeaknesses,
    openWeaknesses: r.openWeaknesses,
    reviewsPassed: r.reviewsPassed,
    stages: new Map(r.stages.map((s) => [s.competencyId, s.stage] as const)),
    completedQuestKeys: new Set([...r.completedQuestKeys, ...extraCompleted]),
  };
}

/** Recovery quests from the player's boss battles (worked out each time, never recorded). */
async function loadRecoveries(store: LearningStore, userId: string, campaignId: string): Promise<Quest[]> {
  const boss = await loadBossContext(store, userId, campaignId);
  if (!boss) return [];
  const course = toBossCourse(boss);
  const records = toBossRecords(boss);
  const titles = new Map(boss.checks.map((c) => [c.id, c.title] as const));
  return bossStages.flatMap((stage) => {
    const rec = recoveryFor(course, records, stage);
    return rec && rec.steps.length > 0 ? recoveryQuests([rec], titles, testedCompetencies(course, stage).map((c) => c.id)) : [];
  });
}

export async function loadQuests(store: LearningStore, userId: string, campaignId: string): Promise<{ ctx: QuestContext; quests: Quest[]; recoveries: Quest[] } | null> {
  const raw = await store.call('quest_context', { p_user_id: userId, p_campaign_id: campaignId });
  if (raw === null) return null;
  const ctx = questContextSchema.parse(raw);
  const recoveries = await loadRecoveries(store, userId, campaignId);
  return { ctx, recoveries, quests: [...recoveries, ...buildQuests(toCourse(campaignId, ctx), toRecords(ctx))] };
}

const paidSchema = z.object({ xpPaid: z.array(z.string()) });

/**
 * Lists a campaign's quests and records any the player has just finished (with their one-time
 * XP). A paused or completed campaign is listed but nothing is recorded.
 */
export async function listQuests(store: LearningStore, userId: string, campaignId: string) {
  const loaded = await loadQuests(store, userId, campaignId);
  if (!loaded) return null;
  const { ctx } = loaded;
  let quests = loaded.quests;
  const newly: { key: string; title: string; xp: number }[] = [];

  const ready = questsToComplete(quests, campaignId);
  if (ctx.campaignStatus === 'active' && ready.length > 0) {
    const byKey = new Map(quests.map((q) => [q.key, q] as const));
    const recorded = paidSchema.parse(
      await store.call('learning_record_quests', {
        p_user_id: userId,
        p_campaign_id: campaignId,
        p_quests: ready.map((r) => {
          const q = byKey.get(r.key)!;
          return { questKey: r.key, xp: r.xp, snapshot: { title: q.title, kind: q.kind, objectives: q.objectives.map((o) => o.id) } };
        }),
      }),
    );
    for (const r of ready) newly.push({ key: r.key, title: byKey.get(r.key)!.title, xp: recorded.xpPaid.includes(r.xp.idempotencyKey) ? r.xp.amount : 0 });
    // Completing one gate can reveal the next, so rebuild from the updated records.
    quests = [...loaded.recoveries, ...buildQuests(toCourse(campaignId, ctx), toRecords(ctx, ready.map((r) => r.key)))];
  }
  const stories = new Map(ctx.stories.map((s) => [s.questKey, { ...s.story, origin: s.origin }] as const));
  return {
    campaignStatus: ctx.campaignStatus,
    quests: quests.map((q) => ({ ...q, story: stories.get(q.key) ?? null })),
    newlyCompleted: newly,
  };
}
