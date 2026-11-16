import type { AttributeId } from '../../engine/character/attributes.ts';
import { validateCurriculum, type AssessmentItem, type Citation, type Curriculum, type CurriculumInput } from '../../engine/learning/curriculum.ts';
import type { CheckReply, CourseRequest, LessonReply, OutlineReply } from '../ai/roles/courseBuilder.ts';
import type { AdviceArea } from './topicGuard.ts';
import type { WikiArticle } from './wikipedia.ts';

/**
 * Turns the Course Builder's checked output into the game's own curriculum format, validates it
 * with the same `validateCurriculum` gate authored courses pass, and shapes database rows for the
 * service-role functions in the `*_generated_subjects` migration. Keys and ids are made here, never
 * by the AI. Pure: no network or database.
 */

export const courseVersion = 1;
export const discipline = 'course';
export const topic = 'main';

export const slug = (s: string, max = 30) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '') || 'item';

/** Unique keys from names: "geography", "geography-2", … */
export function uniqueKeys(names: readonly string[], max = 30): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = slug(n, max);
    let k = base;
    for (let i = 2; used.has(k); i++) k = `${base.slice(0, max - String(i).length - 1)}-${i}`;
    used.add(k);
    return k;
  });
}

export interface PlannedLesson {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly competency: string;
  readonly article: WikiArticle;
  readonly source: string;
  readonly built: boolean;
}

export interface SubjectPlan {
  readonly templateId: string;
  readonly origin: 'ai' | 'fixture';
  readonly subject: string;
  readonly title: string;
  readonly module: string;
  readonly description: string;
  readonly adviceArea: AdviceArea;
  readonly request: CourseRequest;
  readonly subSkills: Readonly<Record<AttributeId, string>>;
  readonly competencies: readonly { key: string; name: string; description: string; attribute: AttributeId }[];
  readonly sources: readonly { key: string; title: string; url: string; pageId: number }[];
  readonly lessons: readonly PlannedLesson[];
}

/** The plan for a new subject, from a checked outline and the articles the server found. */
export function planSubject(templateId: string, origin: 'ai' | 'fixture', request: CourseRequest, outline: OutlineReply, articles: readonly WikiArticle[], adviceArea: AdviceArea): SubjectPlan {
  // Drop competencies no lesson builds; a lesson pointing past the list builds the first one.
  const usedIdx = [...new Set(outline.lessons.map((l) => (l.competency < outline.competencies.length ? l.competency : 0)))].sort();
  const comps = usedIdx.map((i) => outline.competencies[i]!);
  const compKeys = uniqueKeys(comps.map((c) => c.name));
  const compKeyOf = (i: number) => compKeys[usedIdx.indexOf(i < outline.competencies.length ? i : 0)]!;

  const sources: { key: string; title: string; url: string; pageId: number }[] = [];
  const sourceKeyOf = (a: WikiArticle) => {
    const found = sources.find((s) => s.pageId === a.pageId);
    if (found) return found.key;
    const key = uniqueKeys([...sources.map((s) => s.key), `wikipedia-${a.title}`], 50).at(-1)!;
    sources.push({ key, title: a.title, url: a.url, pageId: a.pageId });
    return key;
  };
  const lessonKeys = uniqueKeys(outline.lessons.map((l, i) => `l${i + 1}-${l.title}`), 24);
  return {
    templateId,
    origin,
    subject: request.subject.trim().slice(0, 80),
    title: outline.title.trim(),
    module: outline.module.trim(),
    description: outline.description.trim(),
    adviceArea,
    request,
    subSkills: outline.subSkills,
    competencies: comps.map((c, i) => ({ key: compKeys[i]!, name: c.name.trim(), description: c.description.trim(), attribute: c.attribute })),
    sources,
    lessons: outline.lessons.map((l, i) => ({
      key: lessonKeys[i]!, title: l.title.trim(), summary: l.summary.trim(), competency: compKeyOf(l.competency), article: articles[i]!, source: sourceKeyOf(articles[i]!), built: false,
    })),
  };
}

const quoteLocator = (q: string) => {
  const t = q.trim();
  return t.length <= 196 ? `“${t}”` : `“${t.slice(0, 194).trimEnd()}…”`;
};

/** The words a player reads in a lesson: headings and paragraphs. Check questions must quote these. */
export function lessonText(lesson: LessonReply): string {
  return lesson.sections.map((s) => [s.heading, ...s.paragraphs].join('\n')).join('\n\n');
}

export interface BuiltLesson {
  readonly curriculum: Curriculum;
  readonly codexKeys: readonly string[];
}

/** One lesson and its check as a small curriculum, validated like any authored course. */
export function assembleLesson(plan: SubjectPlan, lessonKey: string, lesson: LessonReply, check: CheckReply, checkedOn: string): { ok: true; built: BuiltLesson } | { ok: false; issues: readonly string[] } {
  const index = plan.lessons.findIndex((l) => l.key === lessonKey);
  const pl = plan.lessons[index];
  if (!pl) return { ok: false, issues: ['unknown lesson'] };
  const cite = (q: string): Citation[] => [{ source: pl.source, locator: quoteLocator(q) }];
  const codexKeys = uniqueKeys(lesson.concepts.map((c) => `${lessonKey}-${c.title}`), 55);

  const items: AssessmentItem[] = [
    ...check.questions.map(
      (q, i): AssessmentItem => ({
        key: `${lessonKey}-q${i + 1}`,
        kind: 'single_choice',
        concept: codexKeys[q.concept]!,
        difficulty: q.difficulty as 1 | 2 | 3,
        prompt: q.prompt.trim(),
        explanation: `${q.explanation.trim()}\n\nFrom the lesson: ${quoteLocator(q.support)}`.slice(0, 1200),
        errorCategory: 'misremembered_fact',
        citations: [],
        options: q.options.map((text, j) => ({ key: String.fromCharCode(97 + j), text: text.trim() })),
        answer: String.fromCharCode(97 + q.correct),
      }),
    ),
    {
      key: `${lessonKey}-written`,
      kind: 'written',
      concept: codexKeys[check.written.concept]!,
      difficulty: 2,
      prompt: check.written.prompt.trim(),
      explanation: 'Compare your answer with the model answer and the lesson.',
      errorCategory: 'incomplete_explanation',
      citations: [],
      criteria: check.written.criteria.map((c, i) => ({ key: `c${i + 1}`, description: c.description.trim(), points: c.points })),
      passPoints: check.written.passPoints,
      modelAnswer: check.written.modelAnswer.trim(),
      maxChars: 1200,
    },
  ];
  const questionCount = Math.min(3, check.questions.length);

  const input: CurriculumInput = {
    templateId: plan.templateId,
    version: courseVersion,
    subject: plan.subject,
    origin: plan.origin === 'fixture' ? 'fixture' : 'generated',
    competencies: plan.competencies.map((c) => ({ key: c.key, name: c.name, description: c.description, attribute: c.attribute, prerequisites: [] })),
    disciplines: [
      {
        key: discipline,
        title: plan.module,
        topics: [
          {
            key: topic,
            title: plan.title,
            summary: plan.description,
            objectives: [
              {
                key: `${lessonKey}-goal`,
                statement: pl.summary,
                activities: [
                  {
                    key: lessonKey,
                    kind: 'lesson',
                    title: pl.title,
                    competencies: [pl.competency],
                    estimatedMinutes: lesson.estimatedMinutes,
                    sections: lesson.sections.map((s) => ({ heading: s.heading.trim(), paragraphs: s.paragraphs.map((p) => p.trim()), certainty: s.certainty, citations: cite(s.quote) })),
                    introduces: codexKeys,
                  },
                  {
                    key: `${lessonKey}-check`,
                    kind: 'assessment',
                    title: `Check: ${pl.title}`.slice(0, 120),
                    competencies: [pl.competency],
                    // The engine, not the AI, decides what each check is evidence for.
                    targetStage: index < 2 ? 2 : 3,
                    questionCount,
                    writtenCount: 1,
                    items,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    codex: lesson.concepts.map((c, i) => ({
      key: codexKeys[i]!,
      title: c.title.trim(),
      summary: c.summary.trim(),
      explanation: c.explanation.map((p) => p.trim()),
      related: codexKeys.filter((k) => k !== codexKeys[i]).slice(0, 8),
      competencies: [pl.competency],
      certainty: c.certainty,
      citations: cite(c.quote),
    })),
    sources: plan.sources.map((s) => ({
      key: s.key, title: s.title, publisher: 'Wikipedia', url: s.url, sourceType: 'reference_work', verification: 'verified', checkedOn,
    })),
  };
  const v = validateCurriculum(input);
  if (!v.ok) return { ok: false, issues: v.issues };
  return { ok: true, built: { curriculum: v.curriculum, codexKeys } };
}

// ───────────────────────────────────────────── Database rows

const idOf = (templateId: string) => (key: string) => `${templateId}/${key}`;

/** Rows for `ai_create_subject`: template, sub-skills, competencies, sources, outline nodes, plan. */
export function subjectRows(plan: SubjectPlan, checkedOn: string) {
  const id = idOf(plan.templateId);
  return {
    template: { id: plan.templateId, subject: plan.subject, title: plan.title, module: plan.module, version: courseVersion },
    origin: plan.origin === 'fixture' ? 'fixture' : 'generated',
    subSkills: Object.entries(plan.subSkills).map(([attribute, name]) => ({ attribute, name: name.trim().slice(0, 40) })),
    competencies: plan.competencies.map((c) => ({ id: id(c.key), key: c.key, name: c.name, description: c.description, attribute: c.attribute })),
    sources: plan.sources.map((s) => ({
      id: id(s.key), template_id: plan.templateId, key: s.key, title: s.title, author: null, publisher: 'Wikipedia', url: s.url,
      source_type: 'reference_work', publication_date: null, verification_status: 'verified', checked_on: checkedOn,
    })),
    nodes: [
      { id: id(discipline), template_id: plan.templateId, parent_id: null, kind: 'discipline', key: discipline, title: plan.module, summary: '', position: 0 },
      { id: id(topic), template_id: plan.templateId, parent_id: id(discipline), kind: 'topic', key: topic, title: plan.title, summary: plan.description, position: 0 },
      ...plan.lessons.map((l, i) => ({ id: id(`${l.key}-goal`), template_id: plan.templateId, parent_id: id(topic), kind: 'objective', key: `${l.key}-goal`, title: l.summary, summary: '', position: i })),
    ],
    subject: {
      description: plan.description,
      advice_area: plan.adviceArea,
      request: plan.request,
      outline: { lessons: plan.lessons },
    },
  };
}

/** Rows for `ai_save_lesson`: Codex entries, the lesson, its check and the check's questions. */
export function lessonRows(c: Curriculum) {
  const id = idOf(c.templateId);
  const cites = (list: readonly Citation[]) => list.map((ct) => ({ sourceId: id(ct.source), ...(ct.locator ? { locator: ct.locator } : {}) }));
  const objective = c.disciplines[0]!.topics[0]!.objectives[0]!;
  const codex = c.codex.map((e) => ({
    id: id(e.key), template_id: c.templateId, key: e.key, title: e.title, summary: e.summary, explanation: e.explanation, examples: e.examples,
    applications: e.applications, related_ids: e.related.map(id), competency_ids: e.competencies.map(id), certainty: e.certainty, citations: cites(e.citations),
  }));
  const activities = objective.activities.map((a, position) => {
    const common = { id: id(a.key), template_id: c.templateId, objective_id: id(objective.key), key: a.key, kind: a.kind, title: a.title, position, competency_ids: a.competencies.map(id) };
    return a.kind === 'lesson'
      ? { ...common, estimated_minutes: a.estimatedMinutes, sections: a.sections.map((s) => ({ ...s, citations: cites(s.citations) })), introduces_ids: a.introduces.map(id), target_stage: null, question_count: null, written_count: 0 }
      : { ...common, estimated_minutes: null, sections: null, introduces_ids: [], target_stage: a.targetStage, question_count: a.questionCount, written_count: a.writtenCount };
  });
  const items = objective.activities.flatMap((a) =>
    a.kind === 'assessment'
      ? a.items.map((item, position) => ({ id: id(item.key), activity_id: id(a.key), key: item.key, concept_id: id(item.concept), kind: item.kind, difficulty: item.difficulty, position, definition: item }))
      : [],
  );
  return { codex, activities, items };
}
