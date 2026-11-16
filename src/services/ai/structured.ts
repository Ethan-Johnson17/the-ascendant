import { z } from 'zod';
import { addUsage, AiError, noUsage, type AiMessage, type AiOrigin, type AiProvider, type AiRequest, type AiUsage } from './types.ts';

/** JSON Schema keywords some providers' strict modes reject. Our own zod check still enforces them. */
const unsupported = new Set(['$schema', 'maxLength', 'minLength', 'maxItems', 'minItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format', 'default']);

function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => !unsupported.has(k)).map(([k, v]) => [k, simplify(v)]));
}

/** The provider-facing JSON Schema for a zod schema. */
export function providerSchema(schema: z.ZodType): Record<string, unknown> {
  return simplify(z.toJSONSchema(schema, { target: 'draft-7', io: 'output' })) as Record<string, unknown>;
}

/** Pulls a JSON value out of a reply, tolerating a ```json fence. */
export function parseJsonReply(text: string): unknown {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return JSON.parse(fenced ? fenced[1]! : text.trim());
}

export interface StructuredResult<T> {
  readonly data: T;
  readonly usage: AiUsage;
  readonly attempts: number;
  readonly model: string;
  readonly provider: string;
  readonly origin: AiOrigin;
  /** Why the one repair attempt was needed, or null. Field paths and check codes only. */
  readonly repairReason: string | null;
}

export interface StructuredOptions {
  readonly transientRetries: number;
  /** Waits between transient retries; injected as a no-op in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const describeIssues = (e: z.ZodError) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

/**
 * The same problems for the usage log: field paths (array positions included) and zod's issue
 * codes only, so no text from the reply can end up in the log.
 */
export const repairCodes = (e: z.ZodError) =>
  e.issues
    .slice(0, 5)
    .map((i) => `${i.path.map((p) => (typeof p === 'number' ? String(p) : String(p).replace(/[^A-Za-z0-9_]/g, '').slice(0, 40))).join('.') || '(root)'}: ${i.code}`)
    .join('; ')
    .slice(0, 300);

/**
 * Calls the provider and accepts the reply only if it parses and passes `schema`.
 * - A reply that fails the format gets exactly one repair attempt (the model is shown the error).
 * - Timeouts and temporary outages are retried `transientRetries` times; rate limits are not.
 * - Anything else fails with an AiError. There is never a made-up fallback result.
 */
export async function runStructured<T>(provider: AiProvider, request: Omit<AiRequest, 'jsonSchema'>, schema: z.ZodType<T>, options: StructuredOptions): Promise<StructuredResult<T>> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const full: AiRequest = { ...request, jsonSchema: providerSchema(schema) };
  let usage = noUsage;
  let attempts = 0;

  const call = async (messages: readonly AiMessage[]) => {
    for (let retry = 0; ; retry++) {
      attempts++;
      try {
        const reply = await provider.generate({ ...full, messages });
        usage = addUsage(usage, reply.usage);
        return reply;
      } catch (err) {
        if (err instanceof AiError) usage = addUsage(usage, err.usage);
        const transient = err instanceof AiError && (err.kind === 'timeout' || err.kind === 'unavailable');
        if (!transient || retry >= options.transientRetries) {
          throw err instanceof AiError ? new AiError(err.kind, err.message, usage) : new AiError('unavailable', 'The AI service failed unexpectedly.', usage);
        }
        await sleep(500 * (retry + 1));
      }
    }
  };

  const check = (text: string): { ok: true; data: T } | { ok: false; problem: string; code: string } => {
    let value: unknown;
    try {
      value = parseJsonReply(text);
    } catch {
      return { ok: false, problem: 'the reply was not valid JSON', code: 'not_json' };
    }
    const parsed = schema.safeParse(value);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, problem: describeIssues(parsed.error), code: repairCodes(parsed.error) };
  };

  let reply;
  try {
    reply = await call(full.messages);
  } catch (err) {
    // A provider-side schema rejection (400) also deserves the single repair attempt.
    if (!(err instanceof AiError && err.kind === 'bad_output')) throw err;
    const reason = 'provider_rejected_format';
    reply = await call([...full.messages, { role: 'user', content: 'Your previous reply could not be used. Reply again with only JSON that matches the required format.' }]);
    const second = check(reply.text);
    if (second.ok) return { data: second.data, usage, attempts, model: reply.model, provider: reply.provider, origin: reply.origin, repairReason: reason };
    throw new AiError('bad_output', 'The AI reply did not match the required format.', usage, `${reason}; then ${second.code}`.slice(0, 300));
  }

  const first = check(reply.text);
  if (first.ok) return { data: first.data, usage, attempts, model: reply.model, provider: reply.provider, origin: reply.origin, repairReason: null };

  const repaired = await call([
    ...full.messages,
    { role: 'assistant', content: reply.text.slice(0, 4000) },
    { role: 'user', content: `That reply did not match the required format (${first.problem}). Reply again with only JSON that matches the format exactly.` },
  ]);
  const second = check(repaired.text);
  if (second.ok) return { data: second.data, usage, attempts, model: repaired.model, provider: repaired.provider, origin: repaired.origin, repairReason: first.code };
  throw new AiError('bad_output', 'The AI reply did not match the required format.', usage, `${first.code}; then ${second.code}`.slice(0, 300));
}
