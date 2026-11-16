import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { attributeIds, type AttributeId } from '../../engine/character/attributes.ts';
import { masteryStages, type MasteryStage } from '../../engine/character/attributeGrowth.ts';
import { certaintyLevels, sourceTypes, type Certainty } from '../../engine/learning/curriculum.ts';
import { defaultLearningConfig, errorCategories, type DifficultyPreference, type ErrorCategory } from '../../engine/learning/config.ts';
import { checkUnlocked, countSpacedPasses } from '../../engine/learning/mastery.ts';
import { retentionStatus, type RetentionStatus } from '../../engine/learning/retention.ts';
import { isWeaknessDue, reviewPriority, type WeaknessState } from '../../engine/learning/weakness.ts';
import { RepositoryError, friendlyDbError } from '../game/gameRepository.ts';

/**
 * Everything the learning screens show for one campaign, read straight from the database under
 * the player's own security rules (content is public; records are the player's own). Answer keys
 * are never selected — the database would refuse anyway.
 *
 * `buildCampaignLearning` turns the rows into a ready-to-render view using the same engine rules
 * the server applies, so "locked", "due" and "passes so far" mean exactly what the server means.
 */

const ts = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const citation = z.object({ sourceId: z.string(), locator: z.string().optional() });
const stage = z.number().int().min(1).max(6).transform((n) => n as MasteryStage);

const rowSchemas = {
  nodes: z.array(z.object({ id: z.string(), parent_id: z.string().nullable(), kind: z.enum(['discipline', 'topic', 'objective']), title: z.string(), summary: z.string(), position: z.number() })),
  activities: z.array(
    z.object({
      id: z.string(),
      objective_id: z.string(),
      kind: z.enum(['lesson', 'assessment']),
      title: z.string(),
      position: z.number(),
      competency_ids: z.array(z.string()),
      estimated_minutes: z.number().nullable(),
      sections: z
        .array(z.object({ heading: z.string().optional(), paragraphs: z.array(z.string()), certainty: z.enum(certaintyLevels), citations: z.array(citation) }))
        .nullable(),
      introduces_ids: z.array(z.string()),
      target_stage: z.number().nullable(),
      question_count: z.number().nullable(),
      written_count: z.number().default(0),
    }),
  ),
  codex: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string(),
      explanation: z.array(z.string()),
      examples: z.array(z.string()),
      applications: z.array(z.string()),
      related_ids: z.array(z.string()),
      competency_ids: z.array(z.string()),
      certainty: z.enum(certaintyLevels),
      citations: z.array(citation),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      author: z.string().nullable(),
      publisher: z.string(),
      url: z.string().nullable(),
      source_type: z.enum(sourceTypes),
      publication_date: z.string().nullable(),
      verification_status: z.enum(['verified', 'unverified']),
      checked_on: z.string().nullable(),
    }),
  ),
  competencies: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), attribute: z.enum(attributeIds) })),
  subSkills: z.array(z.object({ attribute: z.enum(attributeIds), name: z.string() })),
  progress: z.array(
    z.object({
      competency_id: z.string(),
      mastery_stage: stage,
      evidence_count: z.number(),
      review_step: z.number().nullable(),
      next_review_at: ts.nullable(),
      needs_review: z.boolean(),
      last_demonstrated_at: ts.nullable(),
    }),
  ),
  completions: z.array(z.object({ activity_id: z.string(), completed_at: ts })),
  concepts: z.array(z.object({ concept_id: z.string(), unlocked_at: ts.nullable(), last_reviewed_at: ts.nullable(), times_correct: z.number(), times_incorrect: z.number() })),
  weaknesses: z.array(
    z.object({
      concept_id: z.string(),
      status: z.enum(['open', 'resolved']),
      error_category: z.enum(errorCategories),
      occurrence_count: z.number(),
      correct_reviews: z.number(),
      next_review_at: ts.nullable(),
      last_mistake_at: ts,
      last_successful_review: ts.nullable(),
      resolved_at: ts.nullable(),
    }),
  ),
  attempts: z.array(z.object({ id: z.string(), activity_id: z.string(), started_at: ts, submitted_at: ts.nullable(), passed: z.boolean().nullable(), score: z.number().nullable(), counted: z.boolean().default(true) })),
  campaign: z.object({ difficulty_preference: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
};

export type LearningRows = { [K in keyof typeof rowSchemas]: z.input<(typeof rowSchemas)[K]> };
type Parsed = { [K in keyof typeof rowSchemas]: z.output<(typeof rowSchemas)[K]> };

// ───────────────────────────────────────────── View types

export interface SourceView {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly publisher: string;
  readonly url: string | null;
  readonly sourceType: (typeof sourceTypes)[number];
  readonly publicationDate: string | null;
  readonly verified: boolean;
  readonly checkedOn: string | null;
}

export interface CitationView {
  readonly source: SourceView;
  readonly locator?: string | undefined;
}

export interface CompetencyView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly attribute: AttributeId;
  readonly subSkill: string;
  readonly stage: MasteryStage;
  readonly stageName: string;
  readonly retention: RetentionStatus;
  readonly nextReviewAt: Date | null;
  /** Spaced passes so far toward the next stage, and how many are needed. */
  readonly towardNext: { readonly passes: number; readonly required: number } | null;
  readonly hasContent: boolean;
  readonly openWeaknesses: number;
}

export interface LessonView {
  readonly kind: 'lesson';
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly competencyIds: readonly string[];
  readonly minutes: number;
  readonly completed: boolean;
  readonly sections: readonly { heading?: string | undefined; paragraphs: readonly string[]; certainty: Certainty; citations: readonly CitationView[] }[];
  readonly introduces: readonly string[];
}

export interface CheckView {
  readonly kind: 'assessment';
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly competencyIds: readonly string[];
  readonly targetStage: number;
  readonly targetStageName: string;
  readonly questionCount: number;
  /** Questions in each attempt that are written answers, marked by the Examiner (AI). */
  readonly writtenCount: number;
  readonly unlocked: boolean;
  readonly passes: number;
  readonly bestScore: number | null;
  /** Any competency this check covers has a retention review due now. */
  readonly reviewDue: boolean;
}

export type ActivityView = LessonView | CheckView;

export interface ObjectiveView {
  readonly id: string;
  readonly statement: string;
  readonly activities: readonly ActivityView[];
}
export interface TopicView {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly objectives: readonly ObjectiveView[];
}
export interface DisciplineView {
  readonly id: string;
  readonly title: string;
  readonly topics: readonly TopicView[];
}

export type CodexStatus = 'locked' | 'learned' | 'practised' | 'weak';

export interface CodexEntryView {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly explanation: readonly string[];
  readonly examples: readonly string[];
  readonly applications: readonly string[];
  readonly related: readonly { id: string; title: string }[];
  readonly competencyIds: readonly string[];
  readonly certainty: Certainty;
  readonly citations: readonly CitationView[];
  readonly status: CodexStatus;
  readonly lastReviewedAt: Date | null;
  readonly timesCorrect: number;
  readonly timesIncorrect: number;
  /** The lesson that unlocks this entry. */
  readonly introducedBy: { id: string; key: string; title: string } | null;
}

export interface WeaknessView {
  readonly conceptId: string;
  readonly conceptTitle: string;
  readonly status: 'open' | 'resolved';
  readonly errorCategory: ErrorCategory;
  readonly occurrences: number;
  readonly correctReviews: number;
  readonly reviewsRequired: number;
  readonly nextReviewAt: Date | null;
  readonly due: boolean;
  readonly priority: number;
  readonly lastMistakeAt: Date;
  readonly resolvedAt: Date | null;
  /** A check that can review this concept now (lowest unlocked stage first). */
  readonly reviewCheck: { id: string; key: string; title: string } | null;
}

export interface CampaignLearning {
  readonly hasCurriculum: boolean;
  readonly preference: DifficultyPreference;
  readonly competencies: readonly CompetencyView[];
  readonly disciplines: readonly DisciplineView[];
  readonly activities: ReadonlyMap<string, ActivityView>;
  readonly codex: readonly CodexEntryView[];
  readonly weaknesses: readonly WeaknessView[];
  readonly sources: readonly SourceView[];
  readonly counts: { readonly lessonsDone: number; readonly lessons: number; readonly checksPassed: number; readonly checks: number; readonly reviewsDue: number };
}

const keyOf = (id: string) => id.slice(id.indexOf('/') + 1);
const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export function parseLearningRows(rows: LearningRows): Parsed {
  const out = {} as Record<string, unknown>;
  for (const [name, schema] of Object.entries(rowSchemas)) {
    const r = (schema as z.ZodType).safeParse(rows[name as keyof LearningRows]);
    if (!r.success) throw new RepositoryError(`Your ${name} data came back in an unexpected shape. Please reload.`);
    out[name] = r.data;
  }
  return out as Parsed;
}

export function buildCampaignLearning(p: Parsed, now: Date): CampaignLearning {
  const config = defaultLearningConfig;
  const sources = p.sources.map<SourceView>((s) => ({
    id: s.id, title: s.title, author: s.author, publisher: s.publisher, url: s.url, sourceType: s.source_type,
    publicationDate: s.publication_date, verified: s.verification_status === 'verified', checkedOn: s.checked_on,
  }));
  const sourceById = new Map(sources.map((s) => [s.id, s] as const));
  const cite = (list: readonly { sourceId: string; locator?: string | undefined }[]) =>
    list.flatMap((c) => {
      const source = sourceById.get(c.sourceId);
      return source ? [{ source, locator: c.locator }] : [];
    });

  const progress = new Map(p.progress.map((r) => [r.competency_id, r] as const));
  const stageOf = (id: string): MasteryStage => progress.get(id)?.mastery_stage ?? 1;
  const completed = new Set(p.completions.map((c) => c.activity_id));
  const submitted = p.attempts.filter((a) => a.submitted_at !== null);
  const activityRows = new Map(p.activities.map((a) => [a.id, a] as const));

  const weaknessStates = p.weaknesses.map<WeaknessState>((w) => ({
    concept: w.concept_id, status: w.status, errorCategory: w.error_category, occurrenceCount: w.occurrence_count,
    correctReviews: w.correct_reviews, nextReviewAt: w.next_review_at, lastMistakeAt: w.last_mistake_at,
    lastSuccessfulReview: w.last_successful_review, resolvedAt: w.resolved_at, incorrectResponses: [],
  }));
  const openWeak = new Set(weaknessStates.filter((w) => w.status === 'open').map((w) => w.concept));
  const codexRows = new Map(p.codex.map((c) => [c.id, c] as const));

  const retentionOf = (id: string) => {
    const r = progress.get(id);
    return { step: r?.review_step ?? null, nextReviewAt: r?.next_review_at ?? null, needsReview: r?.needs_review ?? false, lastDemonstratedAt: r?.last_demonstrated_at ?? null };
  };

  const activities = new Map<string, ActivityView>();
  for (const a of p.activities) {
    if (a.kind === 'lesson') {
      activities.set(a.id, {
        kind: 'lesson', id: a.id, key: keyOf(a.id), title: a.title, competencyIds: a.competency_ids, minutes: a.estimated_minutes ?? 5,
        completed: completed.has(a.id),
        sections: (a.sections ?? []).map((s) => ({ heading: s.heading, paragraphs: s.paragraphs, certainty: s.certainty, citations: cite(s.citations) })),
        introduces: a.introduces_ids,
      });
    } else {
      const target = a.target_stage ?? 2;
      const passes = submitted.filter((t) => t.activity_id === a.id && t.passed);
      // Attempts that didn't count (unsure marking) say nothing about the player's best.
      const scores = submitted.filter((t) => t.activity_id === a.id && t.counted).map((t) => t.score ?? 0);
      activities.set(a.id, {
        kind: 'assessment', id: a.id, key: keyOf(a.id), title: a.title, competencyIds: a.competency_ids, targetStage: target,
        targetStageName: masteryStages[target - 1] ?? '', questionCount: a.question_count ?? 0, writtenCount: a.written_count,
        unlocked: a.competency_ids.every((c) => checkUnlocked(stageOf(c), target)),
        passes: passes.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        reviewDue: a.competency_ids.some((c) => retentionStatus(retentionOf(c), now) === 'due'),
      });
    }
  }

  const nodes = [...p.nodes].sort(byPosition);
  const children = (id: string | null) => nodes.filter((n) => n.parent_id === id);
  const disciplines = children(null).map<DisciplineView>((d) => ({
    id: d.id,
    title: d.title,
    topics: children(d.id).map<TopicView>((t) => ({
      id: t.id,
      title: t.title,
      summary: t.summary,
      objectives: children(t.id).map<ObjectiveView>((o) => ({
        id: o.id,
        statement: o.title,
        activities: p.activities.filter((a) => a.objective_id === o.id).sort(byPosition).map((a) => activities.get(a.id)!),
      })),
    })),
  }));

  const subSkill = new Map(p.subSkills.map((s) => [s.attribute, s.name] as const));
  const competencies = p.competencies.map<CompetencyView>((c) => {
    const s = stageOf(c.id);
    const nextTarget = s + 1;
    const passTimes = submitted
      .filter((t) => t.passed && t.submitted_at && activityRows.get(t.activity_id)?.target_stage === nextTarget && activityRows.get(t.activity_id)?.competency_ids.includes(c.id))
      .map((t) => t.submitted_at!);
    const canAdvance = s < config.mastery.maxStageFromChecks && p.activities.some((a) => a.target_stage === nextTarget && a.competency_ids.includes(c.id));
    return {
      id: c.id, name: c.name, description: c.description, attribute: c.attribute, subSkill: subSkill.get(c.attribute) ?? '',
      stage: s, stageName: masteryStages[s - 1] ?? '',
      retention: retentionStatus(retentionOf(c.id), now),
      nextReviewAt: progress.get(c.id)?.next_review_at ?? null,
      towardNext: canAdvance ? { passes: countSpacedPasses(passTimes, config), required: config.mastery.passesRequired } : null,
      hasContent: p.activities.some((a) => a.competency_ids.includes(c.id)),
      openWeaknesses: [...openWeak].filter((w) => codexRows.get(w)?.competency_ids.includes(c.id)).length,
    };
  });

  const concepts = new Map(p.concepts.map((c) => [c.concept_id, c] as const));
  // The lesson that first introduces each entry, and the entry's place in reading order.
  const introducer = new Map<string, LessonView>();
  const readingOrder = new Map<string, number>();
  const ordered = disciplines.flatMap((d) => d.topics).flatMap((t) => t.objectives).flatMap((o) => o.activities);
  for (const a of ordered) {
    if (a.kind !== 'lesson') continue;
    for (const k of a.introduces) {
      if (introducer.has(k)) continue;
      introducer.set(k, a);
      readingOrder.set(k, readingOrder.size);
    }
  }

  const codex = p.codex.map<CodexEntryView>((c) => {
    const cp = concepts.get(c.id);
    const status: CodexStatus = openWeak.has(c.id) ? 'weak' : !cp?.unlocked_at && !cp?.times_correct ? 'locked' : (cp?.times_correct ?? 0) > 0 ? 'practised' : 'learned';
    const lesson = introducer.get(c.id);
    return {
      id: c.id, title: c.title, summary: c.summary, explanation: c.explanation, examples: c.examples, applications: c.applications,
      related: c.related_ids.flatMap((r) => (codexRows.get(r) ? [{ id: r, title: codexRows.get(r)!.title }] : [])),
      competencyIds: c.competency_ids, certainty: c.certainty, citations: cite(c.citations), status,
      lastReviewedAt: cp?.last_reviewed_at ?? null, timesCorrect: cp?.times_correct ?? 0, timesIncorrect: cp?.times_incorrect ?? 0,
      introducedBy: lesson ? { id: lesson.id, key: lesson.key, title: lesson.title } : null,
    };
  }).sort((a, b) => (readingOrder.get(a.id) ?? Infinity) - (readingOrder.get(b.id) ?? Infinity) || a.title.localeCompare(b.title));

  // A review check for a concept: any unlocked check whose questions can cover it (its competencies),
  // lowest stage first. The server prefers weak concepts when it picks the questions.
  const checks = [...activities.values()].filter((a): a is CheckView => a.kind === 'assessment').sort((a, b) => a.targetStage - b.targetStage);
  const weaknesses = weaknessStates
    .map<WeaknessView>((w) => {
      const entry = codexRows.get(w.concept);
      const check = checks.find((ch) => ch.unlocked && entry?.competency_ids.some((c) => ch.competencyIds.includes(c)));
      return {
        conceptId: w.concept, conceptTitle: entry?.title ?? keyOf(w.concept), status: w.status, errorCategory: w.errorCategory,
        occurrences: w.occurrenceCount, correctReviews: w.correctReviews, reviewsRequired: config.weakness.reviewGapsDays.length,
        nextReviewAt: w.nextReviewAt, due: isWeaknessDue(w, now), priority: reviewPriority(w, now), lastMistakeAt: w.lastMistakeAt,
        resolvedAt: w.resolvedAt, reviewCheck: check ? { id: check.id, key: check.key, title: check.title } : null,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.conceptTitle.localeCompare(b.conceptTitle));

  const all = [...activities.values()];
  return {
    hasCurriculum: p.activities.length > 0,
    preference: p.campaign.difficulty_preference,
    competencies,
    disciplines,
    activities,
    codex,
    weaknesses,
    sources,
    counts: {
      lessonsDone: all.filter((a) => a.kind === 'lesson' && a.completed).length,
      lessons: all.filter((a) => a.kind === 'lesson').length,
      checksPassed: all.filter((a) => a.kind === 'assessment' && a.passes > 0).length,
      checks: all.filter((a) => a.kind === 'assessment').length,
      reviewsDue: competencies.filter((c) => c.retention === 'due').length + weaknesses.filter((w) => w.due).length,
    },
  };
}

/** Loads one campaign's learning data for the signed-in player (or content only, for the sample). */
export async function loadCampaignLearning(db: SupabaseClient, campaign: { id: string; templateId: string } | { id: null; templateId: string }, now = new Date()): Promise<CampaignLearning> {
  const t = campaign.templateId;
  const own = <T,>(q: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>) => q;
  const none = Promise.resolve({ data: [] as unknown[], error: null });
  const cid = campaign.id;
  const results = await Promise.all([
    own(db.from('curriculum_nodes').select('id, parent_id, kind, title, summary, position').eq('template_id', t)),
    own(db.from('learning_activities').select('id, objective_id, kind, title, position, competency_ids, estimated_minutes, sections, introduces_ids, target_stage, question_count, written_count').eq('template_id', t)),
    own(db.from('codex_entries').select('id, title, summary, explanation, examples, applications, related_ids, competency_ids, certainty, citations').eq('template_id', t)),
    own(db.from('sources').select('id, title, author, publisher, url, source_type, publication_date, verification_status, checked_on').eq('template_id', t)),
    own(db.from('competency_definitions').select('id, name, description, attribute').eq('template_id', t).order('id')),
    own(db.from('campaign_sub_skills').select('attribute, name').eq('template_id', t)),
    cid ? own(db.from('competency_progress').select('competency_id, mastery_stage, evidence_count, review_step, next_review_at, needs_review, last_demonstrated_at').eq('campaign_id', cid)) : none,
    cid ? own(db.from('activity_completions').select('activity_id, completed_at').eq('campaign_id', cid)) : none,
    cid ? own(db.from('concept_progress').select('concept_id, unlocked_at, last_reviewed_at, times_correct, times_incorrect').eq('campaign_id', cid)) : none,
    cid ? own(db.from('weakness_records').select('concept_id, status, error_category, occurrence_count, correct_reviews, next_review_at, last_mistake_at, last_successful_review, resolved_at').eq('campaign_id', cid)) : none,
    cid ? own(db.from('assessment_attempts').select('id, activity_id, started_at, submitted_at, passed, score, counted').eq('campaign_id', cid).order('started_at')) : none,
    cid ? own(db.from('campaigns').select('difficulty_preference').eq('id', cid).single()) : Promise.resolve({ data: { difficulty_preference: 0 }, error: null }),
  ]);
  for (const r of results) if (r.error) throw friendlyDbError(r.error);
  const [nodes, activities, codex, sources, competencies, subSkills, progress, completions, concepts, weaknesses, attempts, campaignRow] = results.map((r) => r.data);
  return buildCampaignLearning(
    parseLearningRows({ nodes, activities, codex, sources, competencies, subSkills, progress, completions, concepts, weaknesses, attempts, campaign: campaignRow } as LearningRows),
    now,
  );
}

export async function setDifficultyPreference(db: SupabaseClient, campaignId: string, preference: DifficultyPreference): Promise<void> {
  const { error } = await db.from('campaigns').update({ difficulty_preference: preference }).eq('id', campaignId);
  if (error) throw friendlyDbError(error);
}
