import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, Lock, Search } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge, type BadgeTone } from '../components/ui/Badge.tsx';
import { CampaignPicker, CertaintyBadge, LearningGate, NoCampaigns, SourceList, useChosenCampaign } from '../features/learning/LearningUi.tsx';
import { useCampaignLearning } from '../features/learning/useCampaignLearning.ts';
import type { CampaignLearning, CodexEntryView, CodexStatus } from '../services/learning/learningData.ts';
import { cn } from '../utils/cn.ts';

const statusLabel: Record<CodexStatus, { text: string; tone: BadgeTone }> = {
  locked: { text: 'Not yet learned', tone: 'neutral' },
  learned: { text: 'Learned', tone: 'gold' },
  practised: { text: 'Practised', tone: 'vital' },
  weak: { text: 'Needs review', tone: 'warning' },
};

type Filter = 'all' | 'unlocked' | 'weak';

export default function CodexPage() {
  const { campaigns, chosen, choose } = useChosenCampaign();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Knowledge Codex" title="What you’ve learned" subtitle="Every idea from your lessons, with its explanation and sources. Entries unlock as you read." />
      {chosen ? (
        <>
          <CampaignPicker campaigns={campaigns} chosenId={chosen.id} onChoose={choose} />
          <CodexForCampaign key={chosen.id} campaignId={chosen.id} />
        </>
      ) : (
        <NoCampaigns what="The Codex" />
      )}
    </div>
  );
}

function CodexForCampaign({ campaignId }: { campaignId: string }) {
  const { load, reload } = useCampaignLearning(campaignId);
  return <LearningGate load={load} onRetry={() => void reload()}>{(data) => <CodexList data={data} campaignId={campaignId} />}</LearningGate>;
}

function CodexList({ data, campaignId }: { data: CampaignLearning; campaignId: string }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const searchId = useId();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.codex.filter((e) => {
      if (filter === 'unlocked' && e.status === 'locked') return false;
      if (filter === 'weak' && e.status !== 'weak') return false;
      if (!q) return true;
      // Locked entries are searchable by title only, so search doesn't spoil the lesson.
      const text = e.status === 'locked' ? e.title : [e.title, e.summary, ...e.explanation, ...e.examples].join(' ');
      return text.toLowerCase().includes(q);
    });
  }, [data.codex, query, filter]);

  const unlocked = data.codex.filter((e) => e.status !== 'locked').length;
  if (!data.hasCurriculum) return <Panel><p className="text-ash">This campaign has no lessons yet, so the Codex is empty.</p></Panel>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ash">{unlocked} of {data.codex.length} entries unlocked.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label htmlFor={searchId} className="grid flex-1 gap-1.5 text-sm text-ash">
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-smoke" aria-hidden />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. irrigation, Uruk, clay"
              className="min-h-11 w-full rounded-control border border-iron bg-obsidian pl-9 pr-3 text-ink placeholder:text-smoke focus-visible:outline-2 focus-visible:outline-gold-300"
            />
          </span>
        </label>
        <div role="radiogroup" aria-label="Show" className="grid grid-cols-3 gap-2 sm:w-80">
          {([['all', 'All'], ['unlocked', 'Unlocked'], ['weak', 'Weak']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={filter === v}
              onClick={() => setFilter(v)}
              className={cn('min-h-11 rounded-control border text-sm font-medium', filter === v ? 'border-gold-400 bg-gold-600/25 text-gold-100' : 'border-iron text-ash hover:border-gold-600 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-ash" aria-live="polite">No entries match.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <li key={e.id}>
              <Entry entry={e} campaignId={campaignId} expanded={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onRelated={(id) => { setQuery(''); setFilter('all'); setOpen(id); requestAnimationFrame(() => document.getElementById(`codex-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Entry({ entry: e, campaignId, expanded, onToggle, onRelated }: { entry: CodexEntryView; campaignId: string; expanded: boolean; onToggle: () => void; onRelated: (id: string) => void }) {
  const locked = e.status === 'locked';
  const s = statusLabel[e.status];
  const panelId = `codex-body-${e.id}`;
  return (
    <article id={`codex-${e.id}`} className={cn('scroll-mt-24 rounded-panel border', locked ? 'border-iron/50 bg-obsidian/40' : 'border-iron bg-charcoal/60')}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
        {locked && <Lock className="size-4 shrink-0 text-smoke" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className={cn('block font-medium', locked ? 'text-ash' : 'text-ink')}>{e.title}</span>
          {!locked && <span className="block text-sm text-ash">{e.summary}</span>}
        </span>
        <Badge tone={s.tone}>{s.text}</Badge>
        <ChevronDown className={cn('size-4 shrink-0 text-gold-500 transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>
      {expanded && (
        <div id={panelId} className="space-y-4 border-t border-iron/60 px-4 py-4">
          {locked ? (
            <p className="text-ash">
              Read{' '}
              {e.introducedBy ? (
                <Link to={`/campaigns/${campaignId}/lesson/${e.introducedBy.key}`} className="inline-flex items-center gap-1 text-gold-200 underline decoration-gold-600 underline-offset-2">
                  <BookOpen className="size-4" aria-hidden />{e.introducedBy.title}
                </Link>
              ) : 'its lesson'}{' '}
              to unlock this entry.
            </p>
          ) : (
            <>
              <CertaintyBadge certainty={e.certainty} />
              <div className="space-y-3 font-serif text-lg leading-relaxed text-ink/95">{e.explanation.map((p, i) => <p key={i}>{p}</p>)}</div>
              {e.examples.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-gold-500">Examples</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-ink/90">{e.examples.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {e.applications.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-gold-500">Why it matters</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-ink/90">{e.applications.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {e.related.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-gold-500">Related</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {e.related.map((r) => (
                      <button key={r.id} type="button" onClick={() => onRelated(r.id)} className="min-h-11 rounded-control border border-iron px-3 text-sm text-gold-200 hover:border-gold-600">{r.title}</button>
                    ))}
                  </div>
                </div>
              )}
              <SourceList citations={e.citations} title="References" />
              {(e.timesCorrect > 0 || e.timesIncorrect > 0) && (
                <p className="text-xs text-smoke">
                  Answered correctly {e.timesCorrect}×, incorrectly {e.timesIncorrect}×{e.lastReviewedAt && ` · last practised ${e.lastReviewedAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
                </p>
              )}
              {e.introducedBy && (
                <Link to={`/campaigns/${campaignId}/lesson/${e.introducedBy.key}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-gold-200 hover:text-gold-100">
                  <BookOpen className="size-4" aria-hidden /> Re-read “{e.introducedBy.title}”
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
