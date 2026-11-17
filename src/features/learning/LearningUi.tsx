import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookMarked, ExternalLink, ShieldCheck } from 'lucide-react';
import { masteryStages } from '../../engine/character/attributeGrowth.ts';
import { certaintyNames, type Certainty } from '../../engine/learning/curriculum.ts';
import type { CitationView, SourceView } from '../../services/learning/learningData.ts';
import type { LearningLoad } from './useCampaignLearning.ts';
import { Badge, type BadgeTone } from '../../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { PageFallback } from '../../components/ui/PageFallback.tsx';
import { cn } from '../../utils/cn.ts';
import { useGame } from '../../app/GameProvider.tsx';
import { useCourses } from '../subjects/CoursesProvider.tsx';
import type { PlayerCampaign } from '../../engine/campaigns/campaigns.ts';

/** Six pips, filled up to the current mastery stage. */
export function StagePips({ stage, className }: { stage: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={`Mastery: ${masteryStages[stage - 1]} (stage ${stage} of 6)`}>
      {masteryStages.map((name, i) => (
        <span key={name} className={cn('h-1.5 w-4 rounded-full', i < stage ? 'bg-gold-300' : 'bg-slate ring-1 ring-iron')} />
      ))}
    </span>
  );
}

const certaintyTone: Record<Certainty, BadgeTone> = { established: 'vital', consensus: 'gold', debated: 'warning', uncertain: 'ember' };

export function CertaintyBadge({ certainty }: { certainty: Certainty }) {
  return <Badge tone={certaintyTone[certainty]}>{certaintyNames[certainty]}</Badge>;
}

function describe(s: SourceView): string {
  return [s.author, s.publisher, s.publicationDate].filter(Boolean).join(' · ');
}

/** A reference list. Links open in a new tab. */
export function SourceList({ citations, title = 'Sources' }: { citations: readonly CitationView[] | readonly SourceView[]; title?: string }) {
  const items = citations.map((c) => ('source' in c ? c : { source: c, locator: undefined }));
  const unique = items.filter((c, i) => items.findIndex((d) => d.source.id === c.source.id && d.locator === c.locator) === i);
  if (unique.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold-500">
        <BookMarked className="size-4" aria-hidden /> {title}
      </p>
      <ul className="mt-2 space-y-2">
        {unique.map(({ source: s, locator }) => (
          <li key={s.id + (locator ?? '')} className="text-sm">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1 text-gold-200 underline decoration-gold-600 underline-offset-2 hover:text-gold-100">
                {s.title}
                <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-label="(opens in a new tab)" />
              </a>
            ) : (
              <span className="text-gold-200">{s.title}</span>
            )}
            {locator && <span className="text-ash">, {locator}</span>}
            <span className="block text-xs text-smoke">
              {describe(s)}
              {s.verified ? (
                <span className="ml-2 inline-flex items-center gap-1 text-vital">
                  <ShieldCheck className="size-3" aria-hidden /> Checked {s.checkedOn ?? ''}
                </span>
              ) : (
                <span className="ml-2 text-warning">Not yet verified</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders loading / missing / error states for a campaign's learning data. */
export function LearningGate({ load, onRetry, children }: { load: LearningLoad; onRetry: () => void; children: (data: Extract<LearningLoad, { state: 'ready' }>['data']) => ReactNode }) {
  if (load.state === 'loading') return <PageFallback />;
  if (load.state === 'missing') {
    return (
      <div className="mx-auto max-w-md py-12">
        <Notice tone="warning" title="Campaign not found">That campaign isn’t one of yours. It may have been deleted.</Notice>
        <ButtonLink to="/campaigns" variant="secondary" className="mt-4">Back to campaigns</ButtonLink>
      </div>
    );
  }
  if (load.state === 'error') {
    return (
      <div className="mx-auto max-w-md py-12">
        <Notice tone="warning" title="Couldn’t load lessons">{load.message}</Notice>
        <Button className="mt-4" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  return <>{children(load.data)}</>;
}

/** Shown in sample mode where an action would need a real account. */
export function SampleNote() {
  return (
    <Notice tone="fixture" title="Sample mode">
      You can read the lessons, but taking checks and saving progress need an account. Exit the sample and sign in to play.
    </Notice>
  );
}

/**
 * The campaign a Codex or Weakness Bank page shows: `?campaign=ID` if it is one of the player's,
 * otherwise the most recently played active campaign.
 */
export function useChosenCampaign() {
  const { player } = useGame();
  const [params, setParams] = useSearchParams();
  const asked = params.get('campaign');
  const sorted = [...player.campaigns].sort((a, b) => (a.status === b.status ? b.lastPlayedAt.localeCompare(a.lastPlayedAt) : a.status === 'active' ? -1 : 1));
  const chosen = sorted.find((c) => c.id === asked) ?? sorted[0];
  return { campaigns: sorted, chosen, choose: (id: string) => setParams({ campaign: id }, { replace: true }) };
}

/** A campaign switcher, shown only when the player has more than one campaign. */
export function CampaignPicker({ campaigns, chosenId, onChoose }: { campaigns: readonly PlayerCampaign[]; chosenId: string; onChoose: (id: string) => void }) {
  const { courseInfo } = useCourses();
  if (campaigns.length < 2) return null;
  return (
    <label className="grid gap-1.5 text-sm text-ash sm:max-w-sm">
      Campaign
      <select value={chosenId} onChange={(e) => onChoose(e.target.value)} className="min-h-11 rounded-control border border-iron bg-obsidian px-3 text-ink focus-visible:outline-2 focus-visible:outline-gold-300">
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {courseInfo(c.templateId)?.title ?? 'Campaign'}{c.status === 'paused' ? ' (paused)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown when the player has no campaigns yet. */
export function NoCampaigns({ what }: { what: string }) {
  return (
    <Notice title="Start a campaign first">
      {what} fills up as you learn. Begin a campaign to unlock your first entries.
      <div className="mt-3"><ButtonLink to="/campaigns" variant="secondary">Choose a campaign</ButtonLink></div>
    </Notice>
  );
}
