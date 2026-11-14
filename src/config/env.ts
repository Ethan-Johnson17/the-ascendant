import { z } from 'zod';

/**
 * Client-side environment configuration.
 *
 * Only VITE_* variables reach the browser. Secrets (AI provider keys, the Supabase
 * service-role key) live exclusively in server-side Edge Function secrets and must
 * never appear here.
 *
 * Parsing never throws: a missing or invalid value produces a readable list of issues
 * so the app can show a setup screen instead of crashing.
 */

export const aiModes = ['fixtures', 'live'] as const;
export type AiMode = (typeof aiModes)[number];

const envSchema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .trim()
    .url('VITE_SUPABASE_URL must be a full URL, e.g. https://abcd.supabase.co'),
  VITE_SUPABASE_ANON_KEY: z.string().trim().min(20, 'VITE_SUPABASE_ANON_KEY looks missing or truncated'),
  VITE_AI_MODE: z.enum(aiModes).default('fixtures'),
});

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  aiMode: AiMode;
}

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; issues: string[] };

/** Pure parser, unit-testable without Vite. */
export function parseEnv(raw: Record<string, string | undefined>): ConfigResult {
  // Treat empty strings as "not set" so `.env.example` copied unchanged reads as missing.
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value === '' ? undefined : value]),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const key = issue.path.join('.');
        return issue.code === 'invalid_type' ? `${key} is not set` : issue.message;
      }),
    };
  }
  return {
    ok: true,
    config: {
      supabaseUrl: parsed.data.VITE_SUPABASE_URL,
      supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
      aiMode: parsed.data.VITE_AI_MODE,
    },
  };
}
