import { defaultAiConfig, groqDefaults } from './config.ts';
import { createFixtureProvider } from './fixtureProvider.ts';
import { createOpenAiCompatibleProvider } from './openAiCompatible.ts';
import { fixtureTutorAnswer, tutorMaterialSchema } from './roles/tutor.ts';
import type { AiProvider } from './types.ts';

/** Development fixtures for every role that has one. */
export function createDevelopmentFixtures(): AiProvider {
  return createFixtureProvider({
    tutor: (req) => {
      const hint = req.fixtureHint as { material?: unknown; question?: unknown } | undefined;
      return fixtureTutorAnswer(tutorMaterialSchema.parse(hint?.material), typeof hint?.question === 'string' ? hint.question : '');
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
