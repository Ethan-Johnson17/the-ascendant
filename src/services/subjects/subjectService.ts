import { z } from 'zod';
import { StoreError, type LearningStore } from '../learning/learningService.ts';
import type { AiConfig } from '../ai/config.ts';
import { runStructured } from '../ai/structured.ts';
import type { createUsageLog } from '../ai/usageLog.ts';
import { AiError, noUsage, type AiMessage, type AiProvider } from '../ai/types.ts';
import {
  buildCheckMessages, buildLessonMessages, buildOutlineMessages, checkReplySchema, courseRequestSchema, keepQuoted, keepSupported, lessonReplySchema,
  outlineReplySchema, type CourseRequest,
} from '../ai/roles/courseBuilder.ts';
import { assembleLesson, lessonRows, lessonText, planSubject, subjectRows, type SubjectPlan } from './assemble.ts';
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

  return { create, build };
}
