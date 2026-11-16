import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FlaskConical, Library, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { defaultAiConfig } from '../../services/ai/config.ts';
import { createAiClient, type FurtherReading, type ReadingView } from '../../services/ai/aiClient.ts';

type Load = { state: 'loading' } | { state: 'ready'; data: FurtherReading } | { state: 'error'; message: string };

const kindText: Record<ReadingView['kind'], string> = { web: 'Web page', book: 'Book', article: 'Journal article' };
const checkText: Record<string, string> = {
  catalogue_match: 'found in a library catalogue',
  trusted_publisher: 'trusted publisher',
  page_loaded: 'page loads',
  title_matches: 'title matches',
  about_topic: 'about this topic',
  safe_address: 'safe address',
};

/**
 * "Further reading" for one Codex entry. The Researcher (AI) suggests sources on request; the
 * server checks each against the live page or a library catalogue, and only checked ones are shown.
 * They are extra reading, never the lesson's citations.
 */
export function FurtherReadingPanel({ campaignId, conceptId }: { campaignId: string; conceptId: string }) {
  const { client } = useAuth();
  const { isSample } = useGame();
  const api = useMemo(() => (client && !isSample ? createAiClient(client) : null), [client, isSample]);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHidden, setLastHidden] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      setLoad({ state: 'ready', data: await api.furtherReading(campaignId, conceptId) });
    } catch {
      setLoad({ state: 'error', message: 'Couldn’t load further reading.' });
    }
  }, [api, campaignId, conceptId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!api) return null; // Sample mode: no account, so no AI requests or saved results.

  const search = async () => {
    setBusy(true);
    setError(null);
    const r = await api.research(campaignId, conceptId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setLastHidden(r.data.hidden);
    await refresh();
  };

  const data = load.state === 'ready' ? load.data : null;
  const run = data?.lastRun ?? null;
  const nextAt = run ? new Date(run.at.getTime() + defaultAiConfig.researchCooldownDays * 86_400_000) : null;
  const coolingDown = !!nextAt && nextAt > new Date();
  const hidden = lastHidden ?? (run ? run.suggested - run.verified : 0);

  return (
    <div className="rounded-control border border-iron/70 bg-obsidian/40 p-3">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold-500">
        <Library className="size-4" aria-hidden /> Further reading
      </p>
      {load.state === 'loading' && <p className="mt-2 text-sm text-smoke">Loading…</p>}
      {load.state === 'error' && <p className="mt-2 text-sm text-ash">{load.message}</p>}
      {data && run && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-smoke">
          {run.origin === 'fixture' ? (
            <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture</Badge>
          ) : (
            <Badge tone="arcane"><Sparkles className="size-3" aria-hidden />Found by the Researcher (AI), checked automatically</Badge>
          )}
          <span>Searched {run.at.toLocaleDateString(undefined, { dateStyle: 'medium' })}.</span>
        </p>
      )}
      {data && data.results.length > 0 && (
        <ul className="mt-2 space-y-3">
          {data.results.map((r, i) => (
            <li key={i} className="text-sm">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1 text-gold-200 underline decoration-gold-600 underline-offset-2 hover:text-gold-100">
                  {r.title}
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-label="(opens in a new tab)" />
                </a>
              ) : (
                <span className="text-gold-200">{r.title}</span>
              )}
              <span className="block text-xs text-smoke">
                {[kindText[r.kind], r.author, r.publisher, r.year ? String(r.year) : null].filter(Boolean).join(' · ')}
              </span>
              {/* The check proves the work exists, not what it says, so the AI's description is labelled as its own. */}
              {r.why && <span className="block text-ink/85"><span className="text-xs text-smoke">Researcher’s note (not checked): </span>{r.why}</span>}
              <span className="mt-0.5 flex items-center gap-1 text-xs text-vital">
                <ShieldCheck className="size-3" aria-hidden /> Checked: {r.checks.map((c) => checkText[c.name] ?? c.name).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && run && data.results.length === 0 && (
        <p className="mt-2 text-sm text-ash">
          {run.origin === 'fixture'
            ? 'The development fixture doesn’t suggest sources, so nothing is listed.'
            : run.suggested === 0
              ? 'The Researcher had nothing new to add beyond the references above.'
              : 'No suggestion could be confirmed, so none are shown. The references above are still checked.'}
        </p>
      )}
      {data && run && hidden > 0 && (
        <p className="mt-2 text-xs text-smoke">{hidden} other suggestion{hidden === 1 ? '' : 's'} couldn’t be confirmed and {hidden === 1 ? 'was' : 'were'} hidden.</p>
      )}
      {data && !run && <p className="mt-2 text-sm text-ash">Ask the Researcher (AI) for books, articles and museum pages about this idea. Every suggestion is checked before it is shown.</p>}
      {data && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" disabled={busy || coolingDown} onClick={() => void search()} icon={<Sparkles className="size-4" aria-hidden />}>
            {busy ? 'Searching and checking…' : run ? 'Search again' : 'Find further reading'}
          </Button>
          <span className="text-xs text-smoke">
            {coolingDown && nextAt
              ? `You can search again after ${nextAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}.`
              : 'Uses 1 of your daily AI requests.'}
          </span>
        </div>
      )}
      {error && <Notice tone="warning" className="mt-3">{error}</Notice>}
    </div>
  );
}
