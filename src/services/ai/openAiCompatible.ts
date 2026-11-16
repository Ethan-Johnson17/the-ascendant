import { AiError, type AiProvider, type AiReply, type AiRequest } from './types.ts';

export interface OpenAiCompatibleOptions {
  /** Provider name for logs, e.g. "groq". */
  readonly id: string;
  /** e.g. https://api.groq.com/openai/v1 */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  /** `json_schema` asks the provider to follow the schema; `json_object` only asks for JSON. */
  readonly structuredOutput?: 'json_schema' | 'json_object';
  /** Extra provider-specific request fields, e.g. `{ reasoning_effort: 'low' }`. */
  readonly extraBody?: Record<string, unknown>;
  /** Injected for tests. */
  readonly fetch?: typeof fetch;
}

/**
 * One adapter for every service that speaks the OpenAI chat-completions format (Groq, OpenRouter,
 * Together, a local Ollama server, ...). Switching between them is configuration only.
 */
export function createOpenAiCompatibleProvider(o: OpenAiCompatibleOptions): AiProvider {
  const doFetch = o.fetch ?? fetch;
  const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    id: o.id,
    model: o.model,
    origin: 'ai',
    async generate(req: AiRequest): Promise<AiReply> {
      const body = {
        model: o.model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_completion_tokens: req.maxOutputTokens,
        temperature: req.temperature ?? 0.3,
        response_format:
          (o.structuredOutput ?? 'json_schema') === 'json_schema'
            ? { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.jsonSchema, strict: true } }
            : { type: 'json_object' },
        ...o.extraBody,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), o.timeoutMs);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new AiError('timeout', 'The AI took too long to answer.');
        throw new AiError('unavailable', `Could not reach the AI service (${err instanceof Error ? err.name : 'network error'}).`);
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) throw new AiError('rate_limited', 'The AI service is busy or its free allowance is used up.');
      if (res.status === 401 || res.status === 403) throw new AiError('not_configured', 'The AI service rejected the server key.');
      if (res.status >= 500) throw new AiError('unavailable', `The AI service had a problem (${res.status}).`);

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new AiError('unavailable', 'The AI service sent an unreadable reply.');
      }
      if (!res.ok) {
        // 400s usually mean the reply failed the provider's own schema check: treat as bad output.
        throw new AiError('bad_output', `The AI service refused the request (${res.status}).`);
      }

      const data = json as { choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }; model?: unknown };
      const usage = { inputTokens: toInt(data.usage?.prompt_tokens), outputTokens: toInt(data.usage?.completion_tokens) };
      const choice = data.choices?.[0];
      if (typeof choice?.message?.refusal === 'string' && choice.message.refusal) throw new AiError('refused', 'The AI declined to answer.', usage);
      const text = choice?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        throw new AiError('bad_output', choice?.finish_reason === 'length' ? 'The AI ran out of room before answering.' : 'The AI sent an empty reply.', usage);
      }
      return { text, usage, model: typeof data.model === 'string' ? data.model : o.model, provider: o.id, origin: 'ai' };
    },
  };
}

function toInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}
