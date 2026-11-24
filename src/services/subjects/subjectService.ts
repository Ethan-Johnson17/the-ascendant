import { z } from 'zod';
import { StoreError, type LearningStore } from '../learning/learningService.ts';
import type { AiConfig } from '../ai/config.ts';
import { runStructured } from '../ai/structured.ts';
import type { createUsageLog } from '../ai/usageLog.ts';
import { AiError, noUsage, type AiMessage, type AiProvider } from '../ai/types.ts';
import {
  advancedReplySchema, buildAdvancedMessages, buildCheckMessages, buildProjectMessages, keepAdvanced, keepProject, projectReplySchema, buildLessonMessages, buildOutlineMessages, checkReplySchema, courseRequestSchema, keepQuoted, keepSupported, lessonReplySchema,
  outlineReplySchema, type CourseRequest,
} from '../ai/roles/courseBuilder.ts';
import { assembleLesson, deeperCheckRows, lessonRows, lessonText, planSubject, projectRows, subjectRows, type SubjectPlan } from './assemble.ts';
import { projectStatus } from '../../engine/learning/projects.ts';
import { deepestStage, deeperStatus } from '../../engine/learning/deeper.ts';
import { checkTopic, combineAdvice } from './topicGuard.ts';
import type { Wikipedia } from './wikipedia.ts';

/**
 * "Start a new subject" on the server (the `ai` Edge Function). The Course Builder (AI) proposes;
 * this code checks every quote, builds the keys, validates the course with the engine's own
 * validator, and only then asks the database (service-role functions) to save it.
 *
 *   create: free topic check → slot check → outline (1 request) → find each Wikipedia article → save
 *   build:  fetch the next lesson's article → lesson (1 request) → quote check → check (1 request)
 *           → support check → validate → save. Nothing is saved unless every step passes.
 */

export interface SubjectResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type Log = ReturnType<typeof createUsageLog>;

const plannedLessonSchema = z.object({
  key: z.string(), title: z.string(), summary: z.string(), competency: z.string(), source: z.string(), built: z.boolean(),
  article: z.object({ title: z.string(), url: z.string(), pageId: z.number().int() }),
});
const courseContextSchema = z.object({
  templateId: z.string(),
  campaignId: z.uuid().nullable(),
  campaignStatus: z.enum(['active', 'paused', 'completed']).nullable(),
  closed: z.boolean(),
  curriculumOrigin: z.enum(['generated', 'fixture']),
  subject: z.string(),
  title: z.string(),
  module: z.string(),
  description: z.string(),
  adviceArea: z.enum(['none', 'health', 'law', 'money']),
  request: courseRequestSchema,
  subSkills: z.record(z.string(), z.string()),
  competencies: z.array(z.object({ key: z.string(), name: z.string(), description: z.string(), attribute: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']) })),
  sources: z.array(z.object({ key: z.string(), title: z.string(), url: z.string(), pageId: z.number().int().nullable() })),
  lessons: z.array(plannedLessonSchema),
  completed: z.array(z.string()),
});

const deepenContextSchema = z.object({
  campaignId: z.uuid().nullable(),
  campaignStatus: z.enum(['active', 'paused', 'completed']).nullable(),
  closed: z.boolean(),
  lessonTitle: z.string(),
  sections: z.array(z.object({ heading: z.string(), paragraphs: z.array(z.string()) })),
  codex: z.array(z.object({ key: z.string(), title: z.string() })).min(1),
  checkStages: z.array(z.number().int()),
  nextPosition: z.number().int(),
  competencyId: z.string(),
  competencyName: z.string(),
  skillStage: z.number().int(),
});
const projectContextSchema = z.object({
  campaignId: z.uuid().nullable(),
  campaignStatus: z.enum(['active', 'paused', 'completed']).nullable(),
  closed: z.boolean(),
  allBuilt: z.boolean(),
  hasProject: z.boolean(),
  title: z.string(),
  topicId: z.string().nullable(),
  lessons: z.array(z.object({ title: z.string(), sections: z.array(z.object({ heading: z.string(), paragraphs: z.array(z.string()) })) })),
  codex: z.array(z.object({ key: z.string(), title: z.string() })),
  competencies: z.array(z.object({ id: z.string(), name: z.string(), stage: z.number().int() })),
});
const stageName: Readonly<Record<number, string>> = { 1: 'Novice', 2: 'Apprentice', 3: 'Competent', 4: 'Proficient', 5: 'Advanced' };

const failure: Record<AiError['kind'] | 'internal', { status: number; error: string }> = {
  not_configured: { status: 503, error: 'The Course Builder isn’t set up on this server yet.' },
  timeout: { status: 504, error: 'The Course Builder took too long. Please try again.' },
  rate_limited: { status: 503, error: 'The Course Builder is resting: the shared free AI allowance is used up for now. Please try again in a minute or two.' },
  unavailable: { status: 503, error: 'The Course Builder can’t be reached right now. Please try again in a moment.' },
  bad_output: { status: 502, error: 'The Course Builder’s reply came back garbled, so nothing was saved. Please try again.' },
  refused: { status: 422, error: 'The Course Builder declined this request.' },
  internal: { status: 500, error: 'Something went wrong. Please try again.' },
};

export interface SubjectServiceDeps {
  readonly store: LearningStore;
  readonly provider: AiProvider | null;
  readonly config: AiConfig;
  readonly log: Log;
  readonly wikipedia: Wikipedia;
  readonly now: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Makes new template ids; tests pass a fixed one. */
  readonly newId?: () => string;
}

const randomId = () => `ai-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export function createSubjectService(d: SubjectServiceDeps) {
  const cb = d.config.courseBuilder;
  const limitBody = async (userId: string) => ({
    error: `You’ve used all ${d.config.dailyRequestsPerPlayer} AI requests for today. Your other courses still work.`, code: 'daily_limit', usage: await d.log.usage(userId),
  });

  /** Reserves, asks, logs. Returns the data, or a ready-made failure response. */
  async function ask<T>(userId: string, campaignId: string | null, schemaName: string, messages: AiMessage[], schema: z.ZodType<T>, maxOutputTokens: number, fixtureHint: unknown):
    Promise<{ ok: true; data: T; origin: 'ai' | 'fixture'; usedToday: number } | { ok: false; response: SubjectResponse }> {
    const provider = d.provider!;
    const r = await d.log.reserve(userId, 'course_builder', campaignId);
    if (!r.ok) {
      return { ok: false, response: r.code === 'daily_limit' ? { status: 429, body: await limitBody(userId) } : { status: 429, body: { error: 'That’s a lot of AI requests in one minute. Try again shortly.', code: 'minute_limit' } } };
    }
    try {
      const result = await runStructured(
        provider,
        { role: 'course_builder', schemaName, messages, maxOutputTokens, temperature: 0.2, fixtureHint },
        schema,
        { transientRetries: d.config.transientRetries, ...(d.sleep ? { sleep: d.sleep } : {}) },
      );
      await d.log.finish(userId, r.requestId, 'ok', { origin: result.origin, usage: result.usage, attempts: result.attempts, model: result.model, errorKind: null, repairReason: result.repairReason });
      return { ok: true, data: result.data, origin: result.origin, usedToday: r.usedToday };
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'internal';
      await d.log.finish(userId, r.requestId, 'failed', {
        origin: provider.origin, usage: err instanceof AiError ? err.usage : noUsage, attempts: 0, model: provider.model, errorKind: kind,
        repairReason: err instanceof AiError ? err.repairReason : null,
      });
      if (kind === 'internal') throw err;
      return { ok: false, response: { status: failure[kind].status, body: { error: failure[kind].error, code: kind } } };
    }
  }

  const usageBody = (usedToday: number) => ({ used: usedToday, limit: d.config.dailyRequestsPerPlayer, remaining: Math.max(0, d.config.dailyRequestsPerPlayer - usedToday) });
  const today = () => d.now().toISOString().slice(0, 10);

  async function create(userId: string, request: CourseRequest): Promise<SubjectResponse> {
    const topic = checkTopic(request.subject, request.objective);
    if (!topic.allowed) return { status: 422, body: { error: topic.reason, code: 'refused_topic', aiUsed: false } };

    const slots = z.object({ open: z.number().int() }).parse(await d.store.call('ai_subject_slots', { p_user_id: userId }));
    if (slots.open >= cb.maxOpenSubjects) {
      return { status: 409, body: { error: `You already have ${cb.maxOpenSubjects} AI-made subjects. Close one on its campaign page to start another.`, code: 'subject_limit' } };
    }
    if (!d.provider) return { status: failure.not_configured.status, body: { error: failure.not_configured.error, code: 'not_configured' } };
    if ((await d.log.usage(userId)).remaining < 1) return { status: 429, body: await limitBody(userId) };

    const outline = await ask(userId, null, 'course_outline', buildOutlineMessages(request), outlineReplySchema, cb.outlineTokens, { kind: 'outline', request });
    if (!outline.ok) return outline.response;
    if (outline.data.decision === 'refuse') {
      return { status: 422, body: { error: outline.data.refusalReason.trim() || 'The Course Builder declined this subject.', code: 'refused_topic', aiUsed: true } };
    }

    const articles = await Promise.all(outline.data.lessons.map((l) => d.wikipedia.resolve(l.wikipediaTitle, request.subject).catch(() => null)));
    if (articles.some((a) => a === null)) {
      return { status: 422, body: { error: 'Couldn’t find an encyclopedia article for every lesson, so the course wasn’t made. Try naming the subject more broadly.', code: 'no_sources', aiUsed: true } };
    }
    const plan = planSubject((d.newId ?? randomId)(), outline.origin, request, outline.data, articles as NonNullable<(typeof articles)[number]>[], combineAdvice(topic.adviceArea, outline.data.adviceArea));
    let createdRaw: unknown;
    try {
      createdRaw = await d.store.call('ai_create_subject', { p_user_id: userId, p_max_open: cb.maxOpenSubjects, p_rows: subjectRows(plan, today()) });
    } catch (err) {
      // Two quick requests can both pass the first slot check; the database lets only one through.
      if (err instanceof StoreError && err.code === 'AS001') return { status: 409, body: { error: `You already have ${cb.maxOpenSubjects} AI-made subjects.`, code: 'subject_limit' } };
      throw err;
    }
    const created = z.object({ campaignId: z.uuid() }).parse(createdRaw);
    return {
      status: 200,
      body: { templateId: plan.templateId, campaignId: created.campaignId, title: plan.title, origin: outline.origin, adviceArea: plan.adviceArea, usage: usageBody(outline.usedToday) },
    };
  }

  async function build(userId: string, templateId: string): Promise<SubjectResponse> {
    const raw = await d.store.call('ai_course_context', { p_user_id: userId, p_template_id: templateId });
    if (raw === null) return { status: 404, body: { error: 'That subject was not found.' } };
    const ctx = courseContextSchema.parse(raw);
    if (ctx.closed || ctx.campaignStatus !== 'active' || !ctx.campaignId) return { status: 409, body: { error: 'This subject is closed or paused, so no new lessons are built.', code: 'not_active' } };
    const index = ctx.lessons.findIndex((l) => !l.built);
    if (index < 0) return { status: 409, body: { error: 'Every lesson in this subject is already built.', code: 'all_built' } };
    const next = ctx.lessons[index]!;
    const prev = ctx.lessons[index - 1];
    if (prev && !ctx.completed.includes(`${templateId}/${prev.key}`)) {
      return { status: 409, body: { error: `Finish “${prev.title}” first; the next lesson is built when you reach it.`, code: 'finish_previous' } };
    }
    if (!d.provider) return { status: failure.not_configured.status, body: { error: failure.not_configured.error, code: 'not_configured' } };
    if ((await d.log.usage(userId)).remaining < 2) return { status: 429, body: { ...(await limitBody(userId)), error: 'Building a lesson needs 2 AI requests, and you have fewer left today.' } };

    // The source text is fetched before any request is spent.
    const article = await d.wikipedia.text(next.article.pageId, cb.articleChars).catch(() => null);
    if (!article) return { status: 502, body: { error: 'Couldn’t read this lesson’s encyclopedia article right now. Please try again later.', code: 'source_unavailable' } };

    const lessonAsk = await ask(userId, ctx.campaignId, 'course_lesson', buildLessonMessages({
      courseTitle: ctx.title, lessonTitle: next.title, lessonSummary: next.summary, level: ctx.request.startingProficiency, articleTitle: article.title, articleText: article.text,
    }), lessonReplySchema, cb.lessonTokens, { kind: 'lesson', articleText: article.text });
    if (!lessonAsk.ok) return lessonAsk.response;
    const { lesson, dropped: droppedParts } = keepQuoted(lessonAsk.data, article.text);
    if (lesson.sections.length < 2 || lesson.concepts.length < 1) {
      return { status: 422, body: { error: 'The lesson couldn’t be backed up by its source text, so it wasn’t saved. Please try again.', code: 'unsupported', droppedParts } };
    }

    const text = lessonText(lesson);
    const checkAsk = await ask(userId, ctx.campaignId, 'course_check', buildCheckMessages({ lessonTitle: next.title, lessonText: text, concepts: lesson.concepts.map((c) => c.title) }),
      checkReplySchema, cb.checkTokens, { kind: 'check', lessonText: text, conceptCount: lesson.concepts.length });
    if (!checkAsk.ok) return checkAsk.response;
    const { check, dropped: droppedQuestions } = keepSupported(checkAsk.data, text, lesson.concepts.length);
    if (check.questions.length < 3) {
      return { status: 422, body: { error: 'Too few of the check’s questions could be backed up by the lesson, so nothing was saved. Please try again.', code: 'unsupported', droppedQuestions } };
    }

    const plan: SubjectPlan = {
      templateId, origin: ctx.curriculumOrigin === 'fixture' ? 'fixture' : 'ai', subject: ctx.subject, title: ctx.title, module: ctx.module, description: ctx.description,
      adviceArea: ctx.adviceArea, request: ctx.request, subSkills: ctx.subSkills as SubjectPlan['subSkills'], competencies: ctx.competencies,
      sources: ctx.sources.map((s) => ({ key: s.key, title: s.title, url: s.url, pageId: s.pageId ?? 0 })), lessons: ctx.lessons,
    };
    const assembled = assembleLesson(plan, next.key, lesson, check, today());
    if (!assembled.ok) return { status: 422, body: { error: 'The lesson didn’t pass the game’s course checks, so it wasn’t saved. Please try again.', code: 'invalid', issues: assembled.issues.slice(0, 10) } };

    await d.store.call('ai_save_lesson', { p_user_id: userId, p_template_id: templateId, p_lesson_key: next.key, p_revision_id: article.revisionId, p_rows: lessonRows(assembled.built.curriculum) });
    return {
      status: 200,
      body: {
        lessonKey: next.key, activityId: `${templateId}/${next.key}`, origin: lessonAsk.origin, droppedParts, droppedQuestions,
        usage: usageBody(checkAsk.usedToday),
      },
    };
  }

  /**
   * "Go deeper": writes the next harder check for a built lesson (1 request), from the lesson's own
   * text. Only when the player's skill is ready for it; the database checks the order again.
   */
  async function deepen(userId: string, templateId: string, lessonKey: string): Promise<SubjectResponse> {
    const raw = await d.store.call('ai_deepen_context', { p_user_id: userId, p_template_id: templateId, p_lesson_key: lessonKey });
    if (raw === null) return { status: 404, body: { error: 'That lesson was not found.' } };
    const ctx = deepenContextSchema.parse(raw);
    if (ctx.closed || ctx.campaignStatus !== 'active' || !ctx.campaignId) return { status: 409, body: { error: 'This subject is closed or paused, so nothing new is built.', code: 'not_active' } };
    const status = deeperStatus(ctx.checkStages, ctx.skillStage);
    if (status.kind === 'complete') return { status: 409, body: { error: 'This lesson already has every check up to Advanced.', code: 'complete' } };
    if (status.kind === 'waiting') {
      return { status: 409, body: { error: `Bring ${ctx.competencyName} to ${stageName[status.needs]} first; the harder check is written when you can take it.`, code: 'not_ready' } };
    }
    if (!d.provider) return { status: failure.not_configured.status, body: { error: failure.not_configured.error, code: 'not_configured' } };
    if ((await d.log.usage(userId)).remaining < 1) return { status: 429, body: await limitBody(userId) };

    const text = ctx.sections.map((s) => [s.heading, ...s.paragraphs].join('\n')).join('\n\n');
    const brief = { lessonTitle: ctx.lessonTitle, lessonText: text, concepts: ctx.codex.map((c) => c.title) };
    const lesson = { key: lessonKey, title: ctx.lessonTitle, competencyId: ctx.competencyId, position: ctx.nextPosition };
    const codexKeys = ctx.codex.map((c) => c.key);
    let built: ReturnType<typeof deeperCheckRows>;
    let origin: 'ai' | 'fixture';
    let usedToday: number;
    let dropped = 0;
    if (status.stage === deepestStage) {
      // Advanced: written answers only, so there are no quotes to check; the Examiner marks them.
      const adv = await ask(userId, ctx.campaignId, 'course_advanced', buildAdvancedMessages(brief), advancedReplySchema, cb.checkTokens, { kind: 'advanced', conceptCount: ctx.codex.length });
      if (!adv.ok) return adv.response;
      ({ origin, usedToday } = adv);
      built = deeperCheckRows(templateId, lesson, codexKeys, keepAdvanced(adv.data, ctx.codex.length), status.stage);
    } else {
    const asked = await ask(userId, ctx.campaignId, 'course_check', buildCheckMessages({
      lessonTitle: ctx.lessonTitle, lessonText: text, concepts: ctx.codex.map((c) => c.title), deeperLevel: stageName[status.stage]!,
    }), checkReplySchema, cb.checkTokens, { kind: 'check', lessonText: text, conceptCount: ctx.codex.length });
    if (!asked.ok) return asked.response;
    ({ origin, usedToday } = asked);
    const kept = keepSupported(asked.data, text, ctx.codex.length);
    dropped = kept.dropped;
    if (kept.check.questions.length < 3) {
      return { status: 422, body: { error: 'Too few of the harder questions could be backed up by the lesson, so nothing was saved. Please try again.', code: 'unsupported', droppedQuestions: dropped } };
    }
    built = deeperCheckRows(templateId, lesson, codexKeys, kept.check, status.stage);
    }
    const rows = built;
    if (!rows.ok) return { status: 422, body: { error: 'The harder check didn’t pass the game’s course checks, so it wasn’t saved. Please try again.', code: 'invalid', issues: rows.issues.slice(0, 10) } };
    await d.store.call('ai_save_deeper_check', { p_user_id: userId, p_template_id: templateId, p_lesson_key: lessonKey, p_stage: status.stage, p_rows: { activity: rows.activity, items: rows.items } });
    return {
      status: 200,
      body: { activityId: rows.activity.id, stage: status.stage, origin, droppedQuestions: dropped, usage: usageBody(usedToday) },
    };
  }

  /**
   * Writes an AI-made course's practical project (1 request, once), from its lessons. Only when every
   * lesson is built and every skill they teach is Proficient; the database checks this again.
   */
  async function writeProject(userId: string, templateId: string): Promise<SubjectResponse> {
    const raw = await d.store.call('ai_project_context', { p_user_id: userId, p_template_id: templateId });
    if (raw === null) return { status: 404, body: { error: 'That course was not found.' } };
    const ctx = projectContextSchema.parse(raw);
    if (ctx.closed || ctx.campaignStatus !== 'active' || !ctx.campaignId) return { status: 409, body: { error: 'This subject is closed or paused, so nothing new is built.', code: 'not_active' } };
    const status = projectStatus(ctx);
    if (status.kind === 'written') return { status: 409, body: { error: 'This course already has its project.', code: 'complete' } };
    if (status.kind === 'not_built') return { status: 409, body: { error: 'Build every lesson in this course first.', code: 'not_ready' } };
    if (status.kind === 'waiting') return { status: 409, body: { error: `Bring ${status.needs.join(', ')} to Proficient first; the project is written when you can take it.`, code: 'not_ready' } };
    if (!d.provider) return { status: failure.not_configured.status, body: { error: failure.not_configured.error, code: 'not_configured' } };
    if ((await d.log.usage(userId)).remaining < 1) return { status: 429, body: await limitBody(userId) };
    if (!ctx.topicId || ctx.codex.length === 0) return { status: 409, body: { error: 'This course has no lessons to build a project from.', code: 'not_ready' } };

    const lessons = ctx.lessons.map((l) => ({ title: l.title, text: l.sections.map((s) => [s.heading, ...s.paragraphs].join('\n')).join('\n\n') }));
    const asked = await ask(userId, ctx.campaignId, 'course_project', buildProjectMessages({ courseTitle: ctx.title, lessons, concepts: ctx.codex.map((c) => c.title) }),
      projectReplySchema, cb.projectTokens, { kind: 'project', conceptCount: ctx.codex.length });
    if (!asked.ok) return asked.response;
    const rows = projectRows(templateId, ctx.topicId, ctx.competencies.map((c) => c.id), ctx.codex.map((c) => c.key), keepProject(asked.data, ctx.codex.length));
    if (!rows.ok) return { status: 422, body: { error: 'The project didn’t pass the game’s course checks, so it wasn’t saved. Please try again.', code: 'invalid', issues: rows.issues.slice(0, 10) } };
    await d.store.call('ai_save_project', { p_user_id: userId, p_template_id: templateId, p_rows: { node: rows.node, activity: rows.activity, item: rows.item } });
    return { status: 200, body: { activityId: rows.activity.id, origin: asked.origin, usage: usageBody(asked.usedToday) } };
  }

  return { create, build, deepen, writeProject };
}
