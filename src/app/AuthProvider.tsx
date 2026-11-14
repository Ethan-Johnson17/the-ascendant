import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runtimeConfig } from '../config/runtime.ts';
import { getSupabase } from '../services/supabase.ts';
import { authErrorMessage } from '../features/authentication/validation.ts';

/**
 * Sign-in state for the whole app (Supabase Auth, email + password).
 *
 * Passwords go straight from the form to Supabase; the app never stores them. The session
 * token is kept by supabase-js in this browser so players stay signed in.
 */

export interface AccountUser {
  readonly id: string;
  readonly email: string | null;
}

export type AuthStatus =
  | { state: 'unconfigured'; issues: string[] }
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; user: AccountUser };

type Result = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  status: AuthStatus;
  /** True after the player opened a password-reset link, until they set a new password. */
  recovering: boolean;
  client: SupabaseClient | null;
  signUp(email: string, password: string): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: string }>;
  signIn(email: string, password: string): Promise<Result>;
  signOut(): Promise<Result>;
  sendPasswordReset(email: string): Promise<Result>;
  updatePassword(password: string): Promise<Result>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const client = runtimeConfig.ok ? getSupabase(runtimeConfig.config) : null;

const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: authErrorMessage(error as { code?: string; message?: string; status?: number }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    runtimeConfig.ok ? { state: 'loading' } : { state: 'unconfigured', issues: runtimeConfig.issues },
  );
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!client) return;
    // Fires once at start (INITIAL_SESSION) and on every sign-in, sign-out and token refresh.
    // Only set state here: calling Supabase inside this callback can deadlock its auth lock.
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      setStatus((prev) => {
        if (!session) return { state: 'signed-out' };
        const user = { id: session.user.id, email: session.user.email ?? null };
        // Keep the same object on token refresh so screens don't reload needlessly.
        return prev.state === 'signed-in' && prev.user.id === user.id && prev.user.email === user.email ? prev : { state: 'signed-in', user };
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const notReady = { ok: false as const, error: 'This copy of the game isn’t connected to its database yet.' };
    return {
      status,
      recovering,
      client,
      async signUp(email, password) {
        if (!client) return notReady;
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${origin}/` } });
        if (error) return fail(error);
        // With email confirmation on, Supabase returns no session until the link is opened.
        return { ok: true, needsConfirmation: !data.session };
      },
      async signIn(email, password) {
        if (!client) return notReady;
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        return error ? fail(error) : { ok: true };
      },
      async signOut() {
        if (!client) return notReady;
        const { error } = await client.auth.signOut();
        return error ? fail(error) : { ok: true };
      },
      async sendPasswordReset(email) {
        if (!client) return notReady;
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/reset-password` });
        return error ? fail(error) : { ok: true };
      },
      async updatePassword(password) {
        if (!client) return notReady;
        const { error } = await client.auth.updateUser({ password });
        if (error) return fail(error);
        setRecovering(false);
        return { ok: true };
      },
    };
  }, [status, recovering]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
