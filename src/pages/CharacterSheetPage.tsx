import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Award, Backpack, Feather, Lock, Shield, Sparkles } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Crest } from '../components/game/Crest.tsx';
import { AttributeTile } from '../components/game/AttributeTile.tsx';
import { LevelProgress } from '../features/progression/LevelProgress.tsx';
import { attributeIds } from '../engine/character/attributes.ts';
import { defaultProgressionConfig } from '../engine/progression/config.ts';
import { findBackground, findClass, findRace, findTincture } from '../content/character/options.ts';
import { findTemplate } from '../content/campaigns/catalog.ts';
import { achievements } from '../content/achievements.ts';

export default function CharacterSheetPage() {
  const { player } = useGame();
  const character = player.character;
  if (!character) return null;
  const race = findRace(character.raceId);
  const cls = findClass(character.classId);
  const bg = findBackground(character.backgroundId);
  const created = new Date(character.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const story = [
    { label: 'Ideals', text: character.personality.ideals },
    { label: 'Bonds', text: character.personality.bonds },
    { label: 'Motivation', text: character.personality.motivation },
  ];

  return (
    <div>
      <PageHeader eyebrow="Character sheet" title={character.name} subtitle={`${race?.name} ${cls?.name} · ${bg?.name} · Adventuring since ${created}`} />

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-6">
          <Panel tone="accent" className="flex flex-col items-center text-center">
            <Crest tinctureId={character.appearance.tinctureId} classId={character.classId} size="xl" />
            <p className="mt-4 text-xs uppercase tracking-[0.25em] text-gold-500">Crest of {findTincture(character.appearance.tinctureId)?.name}</p>
            {character.appearance.description && <p className="mt-3 font-serif text-lg italic text-ash">“{character.appearance.description}”</p>}
            <div className="mt-6 w-full text-left">
              <LevelProgress totalXp={character.totalXp} curve={defaultProgressionConfig.characterLevels} label="Character" />
            </div>
          </Panel>

          <Panel eyebrow="Campaigns" title="Campaign levels">
            {player.campaigns.length === 0 ? (
              <p className="text-sm text-ash">No campaigns begun yet.</p>
            ) : (
              <ul className="space-y-4">
                {player.campaigns.map((c) => (
                  <li key={c.id}>
                    <LevelProgress totalXp={c.campaignXp} curve={defaultProgressionConfig.campaignLevels} label={findTemplate(c.templateId)?.module ?? 'Campaign'} compact />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel eyebrow="Attributes" title="Proven through knowledge">
            <p className="mb-4 text-sm text-ash">
              Attributes start at 1 and rise only when you demonstrate knowledge in competencies tied to them. Race, class and background never change them.
            </p>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {attributeIds.map((id) => (
                <AttributeTile key={id} id={id} score={character.attributes[id]} detailed signature={cls?.signatureAttributes.includes(id) ?? false} />
              ))}
            </div>
          </Panel>

          <Panel eyebrow="Encounter features" title="Trait and ability" actions={<Badge tone="arcane">Active from Phase 5</Badge>}>
            <ul className="space-y-4">
              {race && (
                <Feature icon={<Shield className="size-5" aria-hidden />} source={`${race.name} trait`} name={race.trait.name} text={race.trait.description} />
              )}
              {cls && (
                <Feature icon={<Sparkles className="size-5" aria-hidden />} source={`${cls.name} ability`} name={cls.ability.name} text={cls.ability.description} />
              )}
            </ul>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel eyebrow="Background" title={bg?.name ?? 'Background'}>
              <p className="text-sm text-ash">{bg?.storyEffect}</p>
              <h3 className="mt-4 flex items-center gap-2 text-xs uppercase tracking-wider text-gold-500">
                <Backpack className="size-4" aria-hidden /> Carried gear
              </h3>
              {player.items.length === 0 ? (
                <p className="mt-2 text-sm text-smoke">Nothing carried.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-ink">
                  {player.items.map((i) => <li key={i.id}>{i.name}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-smoke">
                Cosmetic for now. <Link to="/inventory" className="text-gold-300 underline-offset-4 hover:underline">Open inventory</Link>
              </p>
            </Panel>

            <Panel eyebrow="Story" title="What drives you">
              <dl className="space-y-3">
                {story.map((s) => (
                  <div key={s.label}>
                    <dt className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold-500">
                      <Feather className="size-3.5" aria-hidden /> {s.label}
                    </dt>
                    <dd className={s.text ? 'mt-0.5 font-serif text-lg text-ink' : 'mt-0.5 text-sm text-smoke'}>{s.text || 'Not written'}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>

          <Panel eyebrow="Achievements" title={`${player.achievements.length} of ${achievements.length} earned`}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {achievements.map((a) => {
                const earned = player.achievements.find((e) => e.achievementId === a.id);
                return (
                  <li key={a.id} className={earned ? 'flex gap-3 rounded-control border border-gold-600/60 bg-gold-600/10 p-3' : 'flex gap-3 rounded-control border border-iron p-3 opacity-70'}>
                    {earned ? <Award className="mt-0.5 size-5 shrink-0 text-gold-300" aria-hidden /> : <Lock className="mt-0.5 size-5 shrink-0 text-smoke" aria-hidden />}
                    <div>
                      <p className={earned ? 'font-display font-semibold text-gold-100' : 'font-display font-semibold text-ash'}>{a.name}</p>
                      <p className="text-sm text-ash">{a.description}</p>
                      <p className="mt-1 text-xs text-smoke">
                        {earned ? `Earned ${new Date(earned.earnedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : 'Not yet earned'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, source, name, text }: { icon: ReactNode; source: string; name: string; text: string }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-gold-600 bg-gold-600/15 text-gold-300">{icon}</span>
      <div>
        <p className="text-xs uppercase tracking-wider text-smoke">{source}</p>
        <p className="font-display text-base font-semibold text-gold-200">{name}</p>
        <p className="text-sm text-ash">{text}</p>
      </div>
    </li>
  );
}
