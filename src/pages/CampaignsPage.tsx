import { useState } from 'react';
import { Landmark, MapPinned, Pause, Play, Hourglass, Star, Swords } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { LevelProgress } from '../features/progression/LevelProgress.tsx';
import { currentCampaign, type PlayerCampaign } from '../engine/campaigns/campaigns.ts';
import { defaultProgressionConfig } from '../engine/progression/config.ts';
import { campaignTemplates, findTemplate } from '../content/campaigns/catalog.ts';

export default function CampaignsPage() {
  const { save, startCampaign, pauseCampaign, resumeCampaign, focusCampaign } = useGame();
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const current = currentCampaign(save.campaigns);

  const run = (result: { ok: true } | { ok: false; error: string }, success: string) =>
    setMessage(result.ok ? { tone: 'info', text: success } : { tone: 'warning', text: result.error });

  return (
    <div>
      <PageHeader
        eyebrow="Campaigns"
        title="Choose your path"
        subtitle="Run as many campaigns as you like. Pause one any time; progress in one never affects another."
      />

      <div aria-live="polite">{message && <Notice tone={message.tone} className="mb-6">{message.text}</Notice>}</div>

      {save.campaigns.length > 0 && (
        <section aria-labelledby="yours" className="mb-10">
          <h2 id="yours" className="mb-4 font-display text-xl font-semibold tracking-wide text-gold-200">Your campaigns</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {save.campaigns.map((c) => (
              <li key={c.id}>
                <YourCampaign
                  campaign={c}
                  isCurrent={current?.id === c.id}
                  onPause={() => run(pauseCampaign(c.id), 'Campaign paused. Your progress is kept.')}
                  onResume={() => run(resumeCampaign(c.id), 'Campaign resumed.')}
                  onFocus={() => run(focusCampaign(c.id), 'This is now your current campaign.')}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="available">
        <h2 id="available" className="mb-4 font-display text-xl font-semibold tracking-wide text-gold-200">Available campaigns</h2>
        <ul className="space-y-4">
          {campaignTemplates.map((t) => {
            const begun = save.campaigns.some((c) => c.templateId === t.id);
            return (
              <li key={t.id}>
                <Panel as="article" tone="raised">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="gold">{t.subject}</Badge>
                    <Badge>Pilot campaign</Badge>
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-semibold tracking-wide text-gold-100">{t.title}</h3>
                  <p className="mt-0.5 font-display text-gold-300">{t.module}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ash">
                    <span className="inline-flex items-center gap-1.5"><Hourglass className="size-4 text-gold-500" aria-hidden />{t.era}</span>
                    <span className="inline-flex items-center gap-1.5"><MapPinned className="size-4 text-gold-500" aria-hidden />{t.region}</span>
                  </div>
                  <p className="mt-4 max-w-3xl font-serif text-lg leading-snug text-ink/90">{t.description}</p>

                  <details className="group mt-5 rounded-control border border-iron bg-obsidian/60">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-gold-200 [&::-webkit-details-marker]:hidden">
                      What you will study
                      <span className="text-xs text-smoke group-open:hidden">Show</span>
                      <span className="hidden text-xs text-smoke group-open:inline">Hide</span>
                    </summary>
                    <div className="grid gap-6 px-4 pb-4 pt-1 sm:grid-cols-2">
                      <div>
                        <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold-500"><Landmark className="size-4" aria-hidden />Competencies</p>
                        <ul className="mt-2 space-y-1 text-sm text-ink">{t.plannedCompetencies.map((c) => <li key={c}>{c}</li>)}</ul>
                      </div>
                      <div>
                        <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold-500"><Swords className="size-4" aria-hidden />Boss encounters</p>
                        <ul className="mt-2 space-y-1 text-sm text-ink">{t.plannedBosses.map((b) => <li key={b}>{b}</li>)}</ul>
                      </div>
                      <p className="text-xs text-smoke sm:col-span-2">
                        Planned outline. The full curriculum, sources and attribute mappings are written and checked in Phase 6.
                      </p>
                    </div>
                  </details>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {begun ? (
                      <Badge tone="vital">Begun</Badge>
                    ) : (
                      <Button size="lg" onClick={() => run(startCampaign(t.id), `You have begun ${t.title}. It is now your current campaign.`)}>
                        Begin campaign
                      </Button>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-sm text-smoke">
          Campaigns on any subject you choose (economics, anatomy, marketing and more) will be generated by the learning engine from Phase 3.
        </p>
      </section>
    </div>
  );
}

function YourCampaign({ campaign, isCurrent, onPause, onResume, onFocus }: { campaign: PlayerCampaign; isCurrent: boolean; onPause: () => void; onResume: () => void; onFocus: () => void }) {
  const template = findTemplate(campaign.templateId);
  const statusTone = campaign.status === 'active' ? 'vital' : campaign.status === 'paused' ? 'warning' : 'gold';
  return (
    <Panel as="article" tone={isCurrent ? 'accent' : 'base'} className="h-full">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone}>{campaign.status}</Badge>
        {isCurrent && (
          <Badge tone="gold">
            <Star className="size-3" aria-hidden /> Current
          </Badge>
        )}
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold text-gold-100">{template?.title ?? 'Unknown campaign'}</h3>
      <p className="text-sm text-ash">{template?.module}</p>
      <div className="mt-4">
        <LevelProgress totalXp={campaign.campaignXp} curve={defaultProgressionConfig.campaignLevels} label="Campaign" compact />
      </div>
      <p className="mt-3 text-xs text-smoke">Last played {new Date(campaign.lastPlayedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {campaign.status === 'active' && (
          <>
            {!isCurrent && (
              <Button variant="secondary" icon={<Star className="size-4" aria-hidden />} onClick={onFocus}>
                Make current
              </Button>
            )}
            <Button variant="ghost" icon={<Pause className="size-4" aria-hidden />} onClick={onPause}>
              Pause
            </Button>
          </>
        )}
        {campaign.status === 'paused' && (
          <Button variant="secondary" icon={<Play className="size-4" aria-hidden />} onClick={onResume}>
            Resume
          </Button>
        )}
      </div>
    </Panel>
  );
}
