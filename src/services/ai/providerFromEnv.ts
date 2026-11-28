import { defaultAiConfig, groqDefaults } from './config.ts';
import { createFixtureProvider } from './fixtureProvider.ts';
import { createOpenAiCompatibleProvider } from './openAiCompatible.ts';
import type { WrittenItem } from '../../engine/learning/curriculum.ts';
import { fixtureAdvice, type AdvisorStep } from './roles/advisor.ts';
import { fixtureExaminerJudgement } from './roles/examiner.ts';
import { fixtureResearch } from './roles/researcher.ts';
import { courseRequestSchema, fixtureAdvanced, fixtureCheck, fixtureLesson, fixtureOutline, fixtureProject } from './roles/courseBuilder.ts';
import { fixtureTutorAnswer, tutorMaterialSchema } from './roles/tutor.ts';
import { fixtureScene, type Scene } from './roles/gameMaster.ts';
import { bossContextSchema, fixtureStrategy } from './roles/strategist.ts';
import type { AiProvider } from './types.ts';
import { fixtureTalk } from './roles/talk.ts';
import type { TalkCharacter } from '../../content/characters.ts';

/** Development fixtures for every role that has one. */
export function createDevelopmentFixtures(): AiProvider {
  return createFixtureProvider({
    tutor: (req) => {
      const hint = req.fixtureHint as { material?: unknown; question?: unknown } | undefined;
      return fixtureTutorAnswer(tutorMaterialSchema.parse(hint?.material), typeof hint?.question === 'string' ? hint.question : '');
    },
    researcher: () => fixtureResearch(),
    game_master: (req) => {
      const talk = (req.fixtureHint as { talk?: { character: TalkCharacter; links: { id: string }[] } } | undefined)?.talk;
      if (talk) return fixtureTalk(talk.character, talk.links);
      const scene = (req.fixtureHint as { scene?: Scene } | undefined)?.scene;
      if (!scene) throw new Error('The Game Master fixture needs the scene.');
      return fixtureScene(scene);
    },
    strategist: (req) => fixtureStrategy(bossContextSchema.parse((req.fixtureHint as { context?: unknown } | undefined)?.context)),
    course_builder: (req) => {
      const hint = req.fixtureHint as { kind?: string; request?: unknown; articleText?: unknown; lessonText?: unknown; conceptCount?: unknown } | undefined;
      if (hint?.kind === 'outline') return fixtureOutline(courseRequestSchema.parse(hint.request));
      if (hint?.kind === 'lesson' && typeof hint.articleText === 'string') return fixtureLesson(hint.articleText);
      if (hint?.kind === 'check' && typeof hint.lessonText === 'string') return fixtureCheck(hint.lessonText, typeof hint.conceptCount === 'number' ? hint.conceptCount : 1);
      if (hint?.kind === 'advanced') return fixtureAdvanced(typeof hint.conceptCount === 'number' ? hint.conceptCount : 1);
      if (hint?.kind === 'project') return fixtureProject(typeof hint.conceptCount === 'number' ? hint.conceptCount : 1);
      throw new Error('The Course Builder fixture needs an outline, lesson, check or advanced hint.');
    },
    progression_advisor: (req) => fixtureAdvice((req.fixtureHint as { steps?: AdvisorStep[] } | undefined)?.steps ?? []),
    examiner: (req) => {
      // The hint is the server's own already-validated question (keyed by database id).
      const hint = req.fixtureHint as { item?: WrittenItem; answer?: unknown } | undefined;
      if (hint?.item?.kind !== 'written') throw new Error('The Examiner fixture marks written questions only.');
      return fixtureExaminerJudgement(hint.item, typeof hint.answer === 'string' ? hint.answer : '');
    },
  });
}

/**
 * Chooses the AI provider from server settings (Edge Function secrets). `get` reads one setting, so
 * this works in Deno and Node without touching either runtime's globals.
 *
 * - AI_PROVIDER=groq (default when AI_API_KEY is set) or openai-compatible: a hosted model.
 * - AI_PROVIDER=fixture: deterministic development answers, labelled as such in the app.
 * - nothing set: `null`, and AI features say they aren't set up. Never a silent fixture.
 */
export function providerFromEnv(get: (name: string) => string | undefined): AiProvider | null {
  const kind = (get('AI_PROVIDER') ?? '').trim().toLowerCase();
  const key = (get('AI_API_KEY') ?? '').trim();
  if (kind === 'fixture') return createDevelopmentFixtures();
  if (!key) return null;
  if (kind && kind !== 'groq' && kind !== 'openai-compatible') return null;

  const effort = (get('AI_REASONING_EFFORT') ?? 'low').trim();
  return createOpenAiCompatibleProvider({
    id: kind === 'openai-compatible' ? 'openai-compatible' : 'groq',
    baseUrl: (get('AI_BASE_URL') ?? '').trim() || groqDefaults.baseUrl,
    model: (get('AI_MODEL') ?? '').trim() || groqDefaults.model,
    apiKey: key,
    timeoutMs: defaultAiConfig.timeoutMs,
    extraBody: effort ? { reasoning_effort: effort } : {},
  });
}
