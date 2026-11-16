import { AiError, type AiProvider, type AiRequest, type AiRole } from './types.ts';

/** Builds a fixture reply (as JSON-compatible data) from a request's `fixtureHint`. */
export type FixtureResponder = (request: AiRequest) => unknown;

/**
 * Development and test stand-in for a real AI. Replies are deterministic, cost nothing, need no
 * network, and are marked `origin: 'fixture'` so the app labels them "Development fixture".
 */
export function createFixtureProvider(responders: Partial<Record<AiRole, FixtureResponder>>): AiProvider {
  return {
    id: 'fixture',
    model: 'fixture',
    origin: 'fixture',
    async generate(request) {
      const respond = responders[request.role];
      if (!respond) throw new AiError('not_configured', `No development fixture exists for the ${request.role} role.`);
      return { text: JSON.stringify(respond(request)), usage: { inputTokens: 0, outputTokens: 0 }, model: 'fixture', provider: 'fixture', origin: 'fixture' };
    },
  };
}
