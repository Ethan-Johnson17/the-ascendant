import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, Database, Cpu, Sparkles } from 'lucide-react';
import { runtimeConfig } from '../../config/runtime.ts';
import { checkConnection, type ConnectionStatus } from '../../services/supabase.ts';
import { defaultProgressionConfig } from '../../engine/progression/config.ts';
import { levelFromXp } from '../../engine/progression/levels.ts';

/**
 * Developer-facing health check (moved here from the Phase 0 foundation screen).
 * Verifies environment configuration, database connectivity and that the engine runs.
 */
export function SystemStatus() {
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
    <ul className="space-y-4">
      <StatusRow
        icon={<Sparkles className="size-5" aria-hidden />}
        label="Configuration"
        tone={runtimeConfig.ok ? 'ok' : 'warn'}
        detail={
          runtimeConfig.ok
            ? `AI mode: ${runtimeConfig.config.aiMode}`
            : runtimeConfig.issues.join(' · ') + ' — expected until the database is set up in Phase 2.'
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
  );
}

type Tone = 'ok' | 'warn' | 'pending';

function StatusRow({ icon, label, detail, tone }: { icon: ReactNode; label: string; detail: string; tone: Tone }) {
  const badge =
    tone === 'ok' ? (
      <CheckCircle2 className="size-5 shrink-0 text-vital" aria-label="OK" />
    ) : tone === 'pending' ? (
      <LoaderCircle className="size-5 shrink-0 animate-spin text-ash" aria-label="Checking" />
    ) : (
      <CircleAlert className="size-5 shrink-0 text-warning" aria-label="Needs attention" />
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
