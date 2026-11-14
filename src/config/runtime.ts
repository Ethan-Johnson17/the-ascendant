import { parseEnv, type ConfigResult } from './env.ts';

/** The app's configuration, read once from Vite's build-time environment. */
export const runtimeConfig: ConfigResult = parseEnv({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_AI_MODE: import.meta.env.VITE_AI_MODE,
});
