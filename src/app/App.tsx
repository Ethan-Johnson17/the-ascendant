import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CircleAlert, LoaderCircle, Database, Cpu, Sparkles } from 'lucide-react';
import { runtimeConfig } from '../config/runtime.ts';
import { checkConnection, type ConnectionStatus } from '../services/supabase.ts';
import { defaultProgressionConfig } from '../engine/progression/config.ts';
import { levelFromXp } from '../engine/progression/levels.ts';
import { duration, easeAscend } from '../styles/motion.ts';

/**
 * PHASE 0 FOUNDATION SCREEN (developer-facing).
 *
 * This is not the game's welcome screen. It verifies that the toolchain, design tokens,
 * environment configuration, database connection and game engine are wired correctly.
 * Phase 1 replaces it with the application shell.
 */
export function App() {
  const [db, setDb] = useState<ConnectionStatus | { state: 'checking' } | { state: 'not-configured' }>(
    runtimeConfig.ok ? { state: 'checking' } : { state: 'not-configured' },
  );

  useEffect(() => {
    if (!runtimeConfig.ok) return;
    let cancelled = false;
    void checkConnection(runtimeConfig.config).then((status) => {
      if (!cancelled) setDb(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Engine self-check: runs real engine code, not a hardcoded value.
  const sample = levelFromXp(1500, defaultProgressionConfig.characterLevels);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: easeAscend }}
        className="text-center"
      >
        <p className="font-sans text-xs uppercase tracking-[0.35em] text-gold-400">Foundation · Phase 0</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-wide text-gold-200 sm:text-5xl">
          The Ascendant
        </h1>
        <p className="mt-4 font-serif text-xl italic text-ash">
          Your real-world knowledge is the source of your character's power.
        </p>
        <div className="mx-auto mt-6 h-px w-32 bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
      </motion.header>

      <section aria-label="System status" className="rounded-panel border border-iron bg-obsidian p-6">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-gold-300">System status</h2>
        <ul className="mt-5 space-y-4">
          <StatusRow
            icon={<Sparkles className="size-5" aria-hidden />}
            label="Configuration"
            tone={runtimeConfig.ok ? 'ok' : 'warn'}
            detail={
              runtimeConfig.ok
                ? `AI mode: ${runtimeConfig.config.aiMode}`
                : runtimeConfig.issues.join(' · ') + ' — copy .env.example to .env.local and fill it in.'
            }
          />
          <StatusRow
            icon={<Database className="size-5" aria-hidden />}
            label="Database (Supabase)"
            tone={db.state === 'connected' ? 'ok' : db.state === 'checking' ? 'pending' : 'warn'}
            detail={
              db.state === 'connected'
                ? 'Connected'
                : db.state === 'checking'
                  ? 'Checking connection…'
                  : db.state === 'not-configured'
                    ? 'Not configured yet'
                    : `Unreachable: ${db.message}`
            }
          />
          <StatusRow
            icon={<Cpu className="size-5" aria-hidden />}
            label="Game engine"
            tone="ok"
            detail={`Self-check: 1,500 XP → level ${sample.level} (${sample.xpIntoLevel}/${sample.xpForNextLevel ?? '—'} toward next)`}
          />
        </ul>
      </section>
    </main>
  );
}

type Tone = 'ok' | 'warn' | 'pending';

function StatusRow({ icon, label, detail, tone }: { icon: ReactNode; label: string; detail: string; tone: Tone }) {
  const badge =
    tone === 'ok' ? (
      <CheckCircle2 className="size-5 text-vital" aria-label="OK" />
    ) : tone === 'pending' ? (
      <LoaderCircle className="size-5 animate-spin text-ash" aria-label="Checking" />
    ) : (
      <CircleAlert className="size-5 text-warning" aria-label="Needs attention" />
    );
  return (
    <li className="flex items-start gap-4">
      <span className="mt-0.5 text-gold-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{label}</p>
        <p className="mt-0.5 break-words text-sm text-ash">{detail}</p>
      </div>
      {badge}
    </li>
  );
}
