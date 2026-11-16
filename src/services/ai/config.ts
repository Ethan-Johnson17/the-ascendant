import type { AiRole } from './types.ts';

/** Tunable AI limits (GAME_DESIGN.md "AI rules"). */
export interface AiConfig {
  /** Requests per player in any rolling 24 hours. */
  readonly dailyRequestsPerPlayer: number;
  /** Requests per player per minute (stops accidental loops and hammering). */
  readonly requestsPerMinute: number;
  readonly timeoutMs: number;
  /** Retries after a timeout or a temporary provider failure (not after a rate limit). */
  readonly transientRetries: number;
  readonly maxOutputTokens: Readonly<Partial<Record<AiRole, number>>>;
  readonly tutor: {
    readonly maxQuestionChars: number;
    /** Earlier question/answer pairs sent back for context. */
    readonly maxHistoryTurns: number;
    readonly maxHistoryChars: number;
  };
}

export const defaultAiConfig: AiConfig = {
  dailyRequestsPerPlayer: 30,
  requestsPerMinute: 5,
  timeoutMs: 30_000,
  transientRetries: 1,
  // Reasoning models spend part of this budget thinking before they answer.
  maxOutputTokens: { tutor: 2000 },
  tutor: { maxQuestionChars: 500, maxHistoryTurns: 3, maxHistoryChars: 1500 },
};

/** Groq's OpenAI-compatible endpoint and the approved default model. */
export const groqDefaults = { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' } as const;
