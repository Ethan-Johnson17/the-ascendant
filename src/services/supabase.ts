import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/env.ts';

/**
 * Browser Supabase client.
 *
 * Uses the public publishable (anon) key only. All access control is enforced in the database by
 * Row Level Security; authoritative game-state writes (XP, mastery, boss outcomes) go
 * through server-side functions that run the game engine, never direct table writes.
 */
let client: SupabaseClient | null = null;

export function getSupabase(config: AppConfig): SupabaseClient {
  client ??= createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export type ConnectionStatus =
  | { state: 'connected' }
  | { state: 'unreachable'; message: string };

/**
 * Lightweight connectivity check: asks the auth service for the current session.
 * Works before any tables exist, so it is valid from Phase 0 onward.
 */
export async function checkConnection(config: AppConfig): Promise<ConnectionStatus> {
  try {
    const { error } = await getSupabase(config).auth.getSession();
    if (error) return { state: 'unreachable', message: error.message };
    return { state: 'connected' };
  } catch (err) {
    return { state: 'unreachable', message: err instanceof Error ? err.message : String(err) };
  }
}
