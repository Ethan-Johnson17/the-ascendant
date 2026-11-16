import { z } from 'zod';
import { attributeIds } from '../character/attributes.ts';
import { errorCategories } from './config.ts';

/**
 * The structured curriculum format (CLAUDE.md Part 7, GAME_DESIGN.md §5):
 *
 *   Subject → Discipline → Topic → Learning objective → Activity → Assessment item
 *
 * Subject-agnostic: the same format holds an authored History module and a curriculum generated
 * for a subject no developer anticipated. `validateCurriculum` is the gate every curriculum must
 * pass before it is saved: shape first (zod), then cross-references (every competency, concept and
 * source a curriculum mentions must exist; every answer key must be answerable).
 *
 * Pure: no browser, Node or Deno APIs.
 */

const key = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'keys are lowercase words joined by hyphens').max(60);
const text = (max: number) => z.string().trim().min(1).max(max);

/** How settled a statement is (GAME_DESIGN.md §5 "Educational source requirements"). */
export const certaintyLevels = ['established', 'consensus', 'debated', 'uncertain'] as const;
export type Certainty = (typeof certaintyLevels)[number];
export const certaintyNames: Readonly<Record<Certainty, string>> = {
  established: 'Established fact',
  consensus: 'Strong scholarly consensus',
  debated: 'Debated by historians',
  uncertain: 'Uncertain',
};

export const sourceTypes = ['museum', 'university', 'textbook', 'peer_reviewed', 'primary_source', 'reference_work', 'organization'] as const;
export const verificationStatuses = ['verified', 'unverified'] as const;

const citation = z.object({
  source: key,
  /** Where in the source: page, section or object number. */
  locator: z.string().trim().max(200).optional(),
});
export type Citation = z.infer<typeof citation>;

const source = z.object({
  key,
  title: text(300),
  author: z.string().trim().max(200).optional(),
  publisher: text(200),
  url: z.url({ protocol: /^https$/ }).optional(),
  sourceType: z.enum(sourceTypes),
  publicationDate: z.string().trim().max(40).optional(),
  /** 'verified' = a person checked the source exists and supports what cites it, on `checkedOn`. */
  verification: z.enum(verificationStatuses),
  checkedOn: z.iso.date().optional(),
});
export type Source = z.infer<typeof source>;

const lessonSection = z.object({
  heading: z.string().trim().max(120).optional(),
  paragraphs: z.array(text(1500)).min(1).max(8),
  certainty: z.enum(certaintyLevels),
  citations: z.array(citation).max(6).default([]),
});

const option = z.object({ key, text: text(300), errorCategory: z.enum(errorCategories).optional() });
const entry = z.object({ key, text: text(300) });

const itemBase = {
  key,
  /** The Codex concept this question tests; wrong answers create a Weakness Bank record for it. */
  concept: key,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: text(600),
  /** Shown after the answer is marked, right or wrong. */
  explanation: text(1200),
  /** Error category recorded for a wrong answer when the chosen option does not name one. */
  errorCategory: z.enum(errorCategories).default('misremembered_fact'),
  citations: z.array(citation).max(4).default([]),
};

const singleChoice = z.object({
  ...itemBase,
  kind: z.literal('single_choice'),
  options: z.array(option).min(2).max(6),
  answer: key,
});
const ordering = z.object({
  ...itemBase,
  kind: z.literal('ordering'),
  /** Listed in the order the player first sees them (never the answer order). */
  entries: z.array(entry).min(3).max(7),
  answer: z.array(key),
});
const matching = z.object({
  ...itemBase,
  kind: z.literal('matching'),
  left: z.array(entry).min(2).max(6),
  right: z.array(entry).min(2).max(6),
  /** left key → right key */
  answer: z.record(key, key),
});
const criterion = z.object({ key, description: text(300), points: z.number().int().min(1).max(5) });
const written = z.object({
  ...itemBase,
  kind: z.literal('written'),
  /**
   * What a good answer does. The Examiner (AI) says which criteria an answer meets; the engine adds
   * up their points and compares them with `passPoints`.
   */
  criteria: z.array(criterion).min(2).max(6),
  passPoints: z.number().int().min(1),
  /** Shown after marking, as an example of a full-marks answer. */
  modelAnswer: text(1200),
  maxChars: z.number().int().min(200).max(2000).default(1200),
});
export type RubricCriterion = z.infer<typeof criterion>;

export const assessmentItemSchema = z.discriminatedUnion('kind', [singleChoice, ordering, matching, written]);
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;
export type WrittenItem = Extract<AssessmentItem, { kind: 'written' }>;
export const itemKinds = ['single_choice', 'ordering', 'matching', 'written'] as const;
export type ItemKind = (typeof itemKinds)[number];

const lesson = z.object({
  key,
  kind: z.literal('lesson'),
  title: text(120),
  competencies: z.array(key).min(1),
  estimatedMinutes: z.number().int().min(1).max(120),
  sections: z.array(lessonSection).min(1).max(12),
  /** Codex entries this lesson unlocks when completed. */
  introduces: z.array(key).default([]),
});

const assessment = z.object({
  key,
  kind: z.literal('assessment'),
  title: text(120),
  competencies: z.array(key).min(1),
  /**
   * The mastery stage this check provides evidence for (2 Apprentice … 4 Proficient; 5 Advanced
   * for checks made only of written questions).
   */
  targetStage: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  /** Questions issued per attempt, drawn from `items`. */
  questionCount: z.number().int().min(1).max(20),
  /** How many of the issued questions are written (marked by the Examiner). */
  writtenCount: z.number().int().min(0).max(5).default(0),
  items: z.array(assessmentItemSchema).min(1).max(60),
});

export const activitySchema = z.discriminatedUnion('kind', [lesson, assessment]);
export type Activity = z.infer<typeof activitySchema>;
export type Lesson = z.infer<typeof lesson>;
export type Assessment = z.infer<typeof assessment>;

const objective = z.object({ key, statement: text(300), activities: z.array(activitySchema).min(1).max(12) });
const topic = z.object({ key, title: text(120), summary: text(600), objectives: z.array(objective).min(1).max(12) });
const discipline = z.object({ key, title: text(120), topics: z.array(topic).min(1).max(20) });

const codexEntry = z.object({
  key,
  title: text(120),
  summary: text(300),
  explanation: z.array(text(1500)).min(1).max(6),
  examples: z.array(text(400)).max(6).default([]),
  applications: z.array(text(400)).max(6).default([]),
  related: z.array(key).max(8).default([]),
  competencies: z.array(key).min(1),
  certainty: z.enum(certaintyLevels),
  citations: z.array(citation).min(1).max(6),
});
export type CodexEntry = z.infer<typeof codexEntry>;

const competency = z.object({
  key,
  name: text(80),
  description: z.string().trim().max(400).default(''),
  attribute: z.enum(attributeIds),
  prerequisites: z.array(key).default([]),
});

export const curriculumSchema = z.object({
  /** The campaign template this curriculum belongs to. */
  templateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  version: z.number().int().min(1),
  subject: text(80),
  /** 'authored' by the team, or 'generated' (by AI in Phase 4, or a labelled development fixture). */
  origin: z.enum(['authored', 'generated', 'fixture']),
  competencies: z.array(competency).min(1).max(40),
  disciplines: z.array(discipline).min(1).max(10),
  codex: z.array(codexEntry).max(400),
  sources: z.array(source).max(200),
});
export type Curriculum = z.infer<typeof curriculumSchema>;
export type CurriculumInput = z.input<typeof curriculumSchema>;

export type CurriculumValidation = { ok: true; curriculum: Curriculum } | { ok: false; issues: readonly string[] };

/** Every activity in curriculum order, with its location. */
export function listActivities(c: Curriculum) {
  return c.disciplines.flatMap((d) =>
    d.topics.flatMap((t) => t.objectives.flatMap((o) => o.activities.map((activity) => ({ discipline: d, topic: t, objective: o, activity })))),
  );
}

function duplicates(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return [...dup];
}

/** Checks one item's answer key is consistent with what the player is shown. */
function itemIssues(item: AssessmentItem): string[] {
  const issues: string[] = [];
  switch (item.kind) {
    case 'single_choice': {
      const keys = item.options.map((o) => o.key);
      if (duplicates(keys).length) issues.push('has duplicate option keys');
      if (!keys.includes(item.answer)) issues.push(`answer "${item.answer}" is not one of its options`);
      if (item.options.find((o) => o.key === item.answer)?.errorCategory) issues.push('gives the correct option an error category');
      if (duplicates(item.options.map((o) => o.text.toLowerCase())).length) issues.push('has two options with the same text');
      break;
    }
    case 'ordering': {
      const keys = item.entries.map((e) => e.key);
      if (duplicates(keys).length) issues.push('has duplicate entry keys');
      const sorted = (a: readonly string[]) => [...a].sort().join('|');
      if (item.answer.length !== keys.length || sorted(item.answer) !== sorted(keys)) issues.push('answer must list every entry exactly once');
      else if (item.answer.join('|') === keys.join('|')) issues.push('shows its entries already in the correct order');
      break;
    }
    case 'matching': {
      const left = item.left.map((e) => e.key);
      const right = item.right.map((e) => e.key);
      if (duplicates(left).length || duplicates(right).length) issues.push('has duplicate keys');
      const pairs = Object.entries(item.answer);
      if (pairs.length !== left.length || !left.every((k) => k in item.answer)) issues.push('answer must pair every left entry');
      if (pairs.some(([, r]) => !right.includes(r))) issues.push('answer pairs with an unknown right entry');
      if (duplicates(pairs.map(([, r]) => r)).length) issues.push('pairs two left entries with the same right entry');
      break;
    }
    case 'written': {
      if (duplicates(item.criteria.map((c) => c.key)).length) issues.push('has duplicate criterion keys');
      const total = item.criteria.reduce((s, c) => s + c.points, 0);
      if (item.passPoints > total) issues.push(`needs ${item.passPoints} points to pass but its criteria give only ${total}`);
      break;
    }
  }
  return issues;
}

/**
 * Validates a curriculum. `templateCompetencies`, when given, are the competency keys of the
 * campaign template it is attached to: the curriculum must define exactly those.
 */
export function validateCurriculum(input: unknown, templateCompetencies?: readonly string[]): CurriculumValidation {
  const parsed = curriculumSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const c = parsed.data;
  const issues: string[] = [];

  const competencyKeys = c.competencies.map((x) => x.key);
  const conceptKeys = c.codex.map((x) => x.key);
  const sourceKeys = c.sources.map((x) => x.key);
  const activities = listActivities(c);
  const items = activities.flatMap(({ activity }) => (activity.kind === 'assessment' ? activity.items : []));

  const dupCheck = (label: string, keys: readonly string[]) => {
    for (const d of duplicates(keys)) issues.push(`${label} "${d}" is defined more than once`);
  };
  dupCheck('Competency', competencyKeys);
  dupCheck('Codex entry', conceptKeys);
  dupCheck('Source', sourceKeys);
  dupCheck('Discipline', c.disciplines.map((d) => d.key));
  dupCheck('Topic', c.disciplines.flatMap((d) => d.topics.map((t) => t.key)));
  dupCheck('Objective', c.disciplines.flatMap((d) => d.topics.flatMap((t) => t.objectives.map((o) => o.key))));
  dupCheck('Activity', activities.map(({ activity }) => activity.key));
  dupCheck('Question', items.map((i) => i.key));

  if (templateCompetencies) {
    const want = [...templateCompetencies].sort().join(', ');
    const have = [...competencyKeys].sort().join(', ');
    if (want !== have) issues.push(`Competencies must match the campaign template (expected ${want}; got ${have})`);
  }

  for (const comp of c.competencies) {
    for (const p of comp.prerequisites) {
      if (p === comp.key) issues.push(`Competency "${comp.key}" lists itself as a prerequisite`);
      else if (!competencyKeys.includes(p)) issues.push(`Competency "${comp.key}" requires unknown competency "${p}"`);
    }
  }

  const checkCompetencies = (where: string, keys: readonly string[]) => {
    for (const k of keys) if (!competencyKeys.includes(k)) issues.push(`${where} refers to unknown competency "${k}"`);
  };
  const checkCitations = (where: string, cites: readonly Citation[]) => {
    for (const ct of cites) if (!sourceKeys.includes(ct.source)) issues.push(`${where} cites unknown source "${ct.source}"`);
  };

  for (const entry of c.codex) {
    checkCompetencies(`Codex entry "${entry.key}"`, entry.competencies);
    checkCitations(`Codex entry "${entry.key}"`, entry.citations);
    for (const r of entry.related) if (!conceptKeys.includes(r) || r === entry.key) issues.push(`Codex entry "${entry.key}" relates to unknown entry "${r}"`);
  }

  const introduced = new Set<string>();
  for (const { activity } of activities) {
    const where = `${activity.kind === 'lesson' ? 'Lesson' : 'Check'} "${activity.key}"`;
    checkCompetencies(where, activity.competencies);
    if (activity.kind === 'lesson') {
      // Accuracy rule (CLAUDE.md Part 8): every lesson gives access to its references.
      if (!activity.sections.some((s) => s.citations.length > 0)) issues.push(`${where} cites no sources`);
      activity.sections.forEach((s, i) => checkCitations(`${where} section ${i + 1}`, s.citations));
      for (const k of activity.introduces) {
        if (!conceptKeys.includes(k)) issues.push(`${where} introduces unknown Codex entry "${k}"`);
        introduced.add(k);
      }
    } else {
      if (activity.items.length < activity.questionCount) {
        issues.push(`${where} issues ${activity.questionCount} questions but has only ${activity.items.length}`);
      }
      const writtenPool = activity.items.filter((i) => i.kind === 'written').length;
      const otherPool = activity.items.length - writtenPool;
      if (activity.writtenCount > activity.questionCount) issues.push(`${where} issues more written questions than questions`);
      if (writtenPool < activity.writtenCount) issues.push(`${where} issues ${activity.writtenCount} written questions but has only ${writtenPool}`);
      if (activity.writtenCount === 0 && writtenPool > 0) issues.push(`${where} has written questions but never issues them (writtenCount is 0)`);
      if (activity.targetStage === 5) {
        // Advanced is earned with applied work only.
        if (activity.writtenCount !== activity.questionCount || otherPool > 0) issues.push(`${where} targets Advanced, so every question must be written`);
      } else if (activity.writtenCount > 0 && otherPool < activity.questionCount) {
        // Without the Examiner the check is issued with no written question, so it needs enough others.
        issues.push(`${where} needs at least ${activity.questionCount} non-written questions to work without the Examiner`);
      }
      for (const item of activity.items) {
        const iw = `Question "${item.key}"`;
        if (!conceptKeys.includes(item.concept)) issues.push(`${iw} tests unknown Codex entry "${item.concept}"`);
        checkCitations(iw, item.citations);
        for (const problem of itemIssues(item)) issues.push(`${iw} ${problem}`);
      }
    }
  }
  for (const k of conceptKeys) if (!introduced.has(k)) issues.push(`Codex entry "${k}" is never introduced by a lesson`);

  // A curriculum may be authored a few competencies at a time, but must teach something.
  if (!competencyKeys.some((comp) => activities.some(({ activity }) => activity.competencies.includes(comp)))) {
    issues.push('No competency has any activities');
  }

  return issues.length ? { ok: false, issues } : { ok: true, curriculum: c };
}
