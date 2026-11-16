import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ClipboardCheck, Library, Target } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { ButtonLink } from '../components/ui/Button.tsx';
import { CampaignPicker, LearningGate, NoCampaigns, useChosenCampaign } from '../features/learning/LearningUi.tsx';
import { useCampaignLearning } from '../features/learning/useCampaignLearning.ts';
import { defaultLearningConfig, errorCategoryNames } from '../engine/learning/config.ts';
import type { CampaignLearning, WeaknessView } from '../services/learning/learningData.ts';
import { cn } from '../utils/cn.ts';

export default function WeaknessBankPage() {
  const { campaigns, chosen, choose } = useChosenCampaign();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Weakness Bank"
        title="Ideas to strengthen"
        subtitle={`Mistakes from your checks land here. Answer a concept correctly in ${defaultLearningConfig.weakness.reviewGapsDays.length} reviews, spaced over several days, to clear it. Mistakes never cost progress.`}
      />
      {chosen ? (
        <>
          <CampaignPicker campaigns={campaigns} chosenId={chosen.id} onChoose={choose} />
          <BankForCampaign key={chosen.id} campaignId={chosen.id} />
        </>
      ) : (
        <NoCampaigns what="The Weakness Bank" />
      )}
    </div>
  );
}

function BankForCampaign({ campaignId }: { campaignId: string }) {
  const { load, reload, isSample } = useCampaignLearning(campaignId);
  return <LearningGate load={load} onRetry={() => void reload()}>{(data) => <Bank data={data} campaignId={campaignId} isSample={isSample} />}</LearningGate>;
}

function Bank({ data, campaignId, isSample }: { data: CampaignLearning; campaignId: string; isSample: boolean }) {
  const open = data.weaknesses.filter((w) => w.status === 'open').sort((a, b) => Number(b.due) - Number(a.due) || b.priority - a.priority);
  const resolved = data.weaknesses.filter((w) => w.status === 'resolved');

  if (data.weaknesses.length === 0) {
    return (
      <Panel tone="accent">
        <p className="flex items-center gap-2 font-medium text-gold-200"><Target className="size-5" aria-hidden />Nothing here yet</p>
        <p className="mt-2 text-ash">
          {isSample ? 'Sample mode doesn’t record answers, so the bank stays empty.' : 'When you miss a question in a check, the idea behind it is added here with a review schedule.'}
        </p>
        <ButtonLink to={`/campaigns/${campaignId}`} variant="secondary" className="mt-4">Go to campaign</ButtonLink>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="open-weak" className="space-y-3">
        <h2 id="open-weak" className="font-display text-xl font-semibold text-gold-200">To review ({open.length})</h2>
        {open.length === 0 ? <p className="text-ash">All clear. Every weakness has been resolved.</p> : (
          <ul className="space-y-3">{open.map((w) => <li key={w.conceptId}><WeaknessCard w={w} campaignId={campaignId} /></li>)}</ul>
        )}
      </section>
      {resolved.length > 0 && (
        <section aria-labelledby="resolved-weak" className="space-y-3">
          <h2 id="resolved-weak" className="font-display text-xl font-semibold text-gold-200">Resolved ({resolved.length})</h2>
          <ul className="space-y-2">
            {resolved.map((w) => (
              <li key={w.conceptId} className="flex min-h-12 items-center gap-3 rounded-control border border-iron/60 bg-obsidian/40 px-4 py-2">
                <CheckCircle2 className="size-5 shrink-0 text-vital" aria-hidden />
                <span className="flex-1 text-ink">{w.conceptTitle}</span>
                {w.resolvedAt && <span className="text-xs text-smoke">cleared {w.resolvedAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function WeaknessCard({ w, campaignId }: { w: WeaknessView; campaignId: string }) {
  return (
    <article className={cn('rounded-panel border p-4', w.due ? 'border-warning/50 bg-charcoal/70' : 'border-iron bg-charcoal/50')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-ink">{w.conceptTitle}</h3>
          <p className="text-sm text-ash">{errorCategoryNames[w.errorCategory]} · missed {w.occurrences}×</p>
        </div>
        {w.due ? <Badge tone="warning">Review due</Badge> : <Badge><CalendarClock className="size-3" aria-hidden />{w.nextReviewAt ? `Next ${w.nextReviewAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}` : 'Scheduled'}</Badge>}
      </div>
      <div className="mt-3 flex items-center gap-2" role="img" aria-label={`${w.correctReviews} of ${w.reviewsRequired} correct reviews`}>
        {Array.from({ length: w.reviewsRequired }, (_, i) => (
          <span key={i} className={cn('h-2 w-8 rounded-full', i < w.correctReviews ? 'bg-vital' : 'bg-slate ring-1 ring-iron')} />
        ))}
        <span className="text-xs text-ash">{w.correctReviews} / {w.reviewsRequired} reviews</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {w.reviewCheck && (
          <ButtonLink to={`/campaigns/${campaignId}/check/${w.reviewCheck.key}`} variant={w.due ? 'primary' : 'secondary'} icon={<ClipboardCheck className="size-4" aria-hidden />}>
            {w.due ? 'Review now' : 'Practise early'}
          </ButtonLink>
        )}
        <Link to={`/codex?campaign=${campaignId}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-gold-200 hover:text-gold-100">
          <Library className="size-4" aria-hidden /> Read in Codex
        </Link>
      </div>
      {!w.due && w.reviewCheck && <p className="mt-2 text-xs text-smoke">Practising early is fine, but only reviews on or after the due date count toward clearing it.</p>}
    </article>
  );
}
