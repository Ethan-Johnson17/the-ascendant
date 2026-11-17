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
  /** Days before the same concept's further reading can be searched again. */
  readonly researchCooldownDays: number;
  /** "Start a new subject" (GAME_DESIGN.md "New-subject courses"). */
  readonly courseBuilder: {
    /** AI-made subjects a player may have open (not closed) at once. */
    readonly maxOpenSubjects: number;
    /** How much of the Wikipedia article is sent with a lesson request (characters). */
    readonly articleChars: number;
    readonly outlineTokens: number;
    readonly lessonTokens: number;
    readonly checkTokens: number;
  };
  /** The Game Master's scenes (groundwork for quests in Phase 5). */
  readonly gameMaster: { readonly maxMessageChars: number; readonly maxHistoryTurns: number };
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
  maxOutputTokens: { tutor: 2000, examiner: 1500, progression_advisor: 1200, researcher: 1500, game_master: 1500, strategist: 2500 },
  researchCooldownDays: 7,
  // Groq's free plan allows 8,000 tokens a minute in total, so a lesson request stays well under it.
  courseBuilder: { maxOpenSubjects: 3, articleChars: 9000, outlineTokens: 2500, lessonTokens: 3500, checkTokens: 2500 },
  gameMaster: { maxMessageChars: 300, maxHistoryTurns: 2 },
  tutor: { maxQuestionChars: 500, maxHistoryTurns: 3, maxHistoryChars: 1500 },
};

/** Groq's OpenAI-compatible endpoint and the approved default model. */
export const groqDefaults = { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' } as const;
