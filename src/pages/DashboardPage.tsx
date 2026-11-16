import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, Hourglass, Lock, Map, Pause } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { Crest } from '../components/game/Crest.tsx';
import { AttributeTile } from '../components/game/AttributeTile.tsx';
import { LevelProgress } from '../features/progression/LevelProgress.tsx';
import { NextStepsPanel } from '../features/learning/NextStepsPanel.tsx';
import { attributeIds } from '../engine/character/attributes.ts';
import { currentCampaign } from '../engine/campaigns/campaigns.ts';
import { defaultProgressionConfig } from '../engine/progression/config.ts';
import { findBackground, findClass, findRace } from '../content/character/options.ts';
import { findTemplate } from '../content/campaigns/catalog.ts';
import { cn } from '../utils/cn.ts';

export default function DashboardPage() {
  const { player, pauseCampaign } = useGame();
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const character = player.character;
  if (!character) return null; // guarded by the router
  const cls = findClass(character.classId);
  const current = currentCampaign(player.campaigns);
  const template = current ? findTemplate(current.templateId) : undefined;
  const otherCount = player.campaigns.length - (current ? 1 : 0);

  const road = [
    { label: 'Create your character', done: true },
    { label: 'Begin a campaign', done: player.campaigns.length > 0 },
    // Campaign XP only comes from lessons, checks and reviews, so any XP means a lesson was completed.
    { label: 'Complete your first lesson', done: player.campaigns.some((c) => c.campaignXp > 0) },
    { label: 'Pass a knowledge check on two different days to raise a competency', done: false, note: 'Shown on the campaign page' },
    { label: 'Face your first boss', done: false, note: 'Phase 5' },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-panel border border-gold-600/80 bg-obsidian p-5 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold-600/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <Crest tinctureId={character.appearance.tinctureId} classId={character.classId} size="lg" className="self-center sm:self-auto" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-500">Welcome back</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-wide text-gold-100 sm:text-4xl">{character.name}</h1>
            <p className="mt-1 text-ash">
              {findRace(character.raceId)?.name} {cls?.name} · {findBackground(character.backgroundId)?.name}
            </p>
            <div className="mt-5 max-w-md">
              <LevelProgress totalXp={character.totalXp} curve={defaultProgressionConfig.characterLevels} label="Character" />
            </div>
          </div>
        </div>
      </section>

      {current && <NextStepsPanel campaignId={current.id} />}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Current campaign */}
        <Panel eyebrow="Current campaign" title={template ? template.title : 'No campaign in progress'} tone={current ? 'accent' : 'base'}>
          {current && template ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="gold">{template.subject}</Badge>
                <Badge>{template.module}</Badge>
              </div>
              <LevelProgress totalXp={current.campaignXp} curve={defaultProgressionConfig.campaignLevels} label="Campaign" compact />
              <p className="text-ash">Lessons and knowledge checks are ready. Quests and bosses arrive in Phase 5.</p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink to={`/campaigns/${current.id}`} icon={<BookOpen className="size-4" aria-hidden />}>
                  Continue learning
                </ButtonLink>
                <ButtonLink to="/campaigns" variant="secondary" icon={<Map className="size-4" aria-hidden />}>
                  {otherCount > 0 ? `All campaigns (${player.campaigns.length})` : 'Campaigns'}
                </ButtonLink>
                <Button
                  variant="ghost"
                  icon={<Pause className="size-4" aria-hidden />}
                  disabled={pausing}
                  onClick={async () => {
                    setPausing(true);
                    const result = await pauseCampaign(current.id);
                    setPausing(false);
                    setPauseError(result.ok ? null : result.error);
                  }}
                >
                  Pause
                </Button>
              </div>
              {pauseError && <Notice tone="warning">{pauseError}</Notice>}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-ash">
                {player.campaigns.length > 0
                  ? 'All your campaigns are paused. Resume one to continue.'
                  : 'Choose a subject to begin your first campaign. You can run several at once.'}
              </p>
              <ButtonLink to="/campaigns" icon={<Map className="size-4" aria-hidden />}>
                {player.campaigns.length > 0 ? 'Manage campaigns' : 'Choose a campaign'}
              </ButtonLink>
            </div>
          )}
        </Panel>

        {/* The road ahead */}
        <Panel eyebrow="Your path" title="The road ahead">
          <ol className="space-y-3">
            {road.map((r) => (
              <li key={r.label} className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
                    r.done ? 'border-vital/60 bg-vital/15 text-vital' : 'border-iron text-smoke',
                  )}
                >
                  {r.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : r.note ? <Lock className="size-3" aria-hidden /> : <Hourglass className="size-3" aria-hidden />}
                </span>
                <div>
                  <p className={r.done ? 'text-ink' : 'text-ash'}>
                    {r.label}
                    <span className="sr-only">{r.done ? ' (done)' : ' (not yet)'}</span>
                  </p>
                  {r.note && <p className="text-xs text-smoke">{r.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel
        eyebrow="Attributes"
        title="Your proven strengths"
        actions={
          <Link to="/character" className="inline-flex min-h-11 items-center gap-1 text-sm text-gold-300 hover:text-gold-100">
            Character sheet <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {attributeIds.map((id) => (
            <AttributeTile key={id} id={id} score={character.attributes[id]} signature={cls?.signatureAttributes.includes(id) ?? false} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
