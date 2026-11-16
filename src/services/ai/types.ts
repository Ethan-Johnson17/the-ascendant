/**
 * Provider-independent AI types. Everything in src/services/ai except aiClient.ts runs on the server (the `ai` Edge
 * Function, Deno) and in Node tests; none of it may touch browser globals or read secrets itself.
 */

export const aiRoles = ['game_master', 'tutor', 'examiner', 'strategist', 'researcher', 'progression_advisor'] as const;
export type AiRole = (typeof aiRoles)[number];

export interface AiMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface AiRequest {
  readonly role: AiRole;
  readonly messages: readonly AiMessage[];
  /** JSON Schema the reply must follow (already simplified for providers). */
  readonly jsonSchema: Record<string, unknown>;
  /** Short name for the schema, e.g. "tutor_answer". */
  readonly schemaName: string;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  /**
   * Structured context for the development fixture provider only. Real providers ignore it; they
   * see the same information in `messages`.
   */
  readonly fixtureHint?: unknown;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** `fixture` replies are deterministic development stand-ins and must be labelled as such in the UI. */
export type AiOrigin = 'ai' | 'fixture';

export interface AiReply {
  readonly text: string;
  readonly usage: AiUsage;
  readonly model: string;
  readonly provider: string;
  readonly origin: AiOrigin;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  readonly origin: AiOrigin;
  generate(request: AiRequest): Promise<AiReply>;
}

export type AiErrorKind = 'not_configured' | 'timeout' | 'rate_limited' | 'unavailable' | 'bad_output' | 'refused';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    /** Tokens already spent before the failure, so usage logs stay accurate. */
    readonly usage: AiUsage = { inputTokens: 0, outputTokens: 0 },
  ) {
    super(message);
  }
}

export const addUsage = (a: AiUsage, b: AiUsage): AiUsage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });
export const noUsage: AiUsage = { inputTokens: 0, outputTokens: 0 };
