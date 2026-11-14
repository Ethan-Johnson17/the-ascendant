import { Badge } from '../../../components/ui/Badge.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { OptionCard, OptionGroup } from '../../../components/ui/OptionCard.tsx';
import { TextArea, TextField } from '../../../components/ui/TextField.tsx';
import { Crest } from '../../../components/game/Crest.tsx';
import { AttributeTile } from '../../../components/game/AttributeTile.tsx';
import { attributeIds, defaultCharacterRules, startingAttributes } from '../../../engine/character/attributes.ts';
import type { CharacterDraft } from '../../../engine/character/createCharacter.ts';
import {
  attributeInfo,
  backgrounds,
  classes,
  findBackground,
  findClass,
  findRace,
  findTincture,
  races,
  tinctures,
} from '../../../content/character/options.ts';
import { cn } from '../../../utils/cn.ts';

interface StepProps {
  draft: CharacterDraft;
  update: (patch: Partial<CharacterDraft>) => void;
  error?: string | undefined;
}

const rules = defaultCharacterRules;

export function NameStep({ draft, update, error }: StepProps) {
  const showError = draft.name.length > 0 ? error : undefined;
  return (
    <TextField
      label="Character name"
      value={draft.name}
      onChange={(e) => update({ name: e.target.value })}
      maxLength={rules.nameMaxLength}
      autoComplete="off"
      autoFocus
      placeholder="e.g. Ninsun of Uruk"
      hint={`${rules.nameMinLength}–${rules.nameMaxLength} characters.`}
      error={showError}
    />
  );
}

export function RaceStep({ draft, update }: StepProps) {
  return (
    <OptionGroup label="Race" className="sm:grid-cols-2">
      {races.map((r) => (
        <OptionCard key={r.id} name="race" value={r.id} checked={draft.raceId === r.id} onSelect={(raceId) => update({ raceId })} title={r.name}>
          <p className="font-serif text-base italic text-ash">{r.lore}</p>
          <p className="mt-2 text-ink">
            <span className="font-medium text-gold-300">{r.trait.name}.</span> {r.trait.description}
          </p>
        </OptionCard>
      ))}
    </OptionGroup>
  );
}

export function ClassStep({ draft, update }: StepProps) {
  return (
    <OptionGroup label="Class" className="sm:grid-cols-2">
      {classes.map((c) => (
        <OptionCard
          key={c.id}
          name="class"
          value={c.id}
          checked={draft.classId === c.id}
          onSelect={(classId) => update({ classId })}
          title={c.name}
          media={<Crest tinctureId={draft.appearance.tinctureId} classId={c.id} size="sm" />}
        >
          <p className="font-serif text-base italic text-ash">{c.lore}</p>
          <p className="mt-2 text-ink">
            <span className="font-medium text-gold-300">{c.ability.name}.</span> {c.ability.description}
          </p>
          <p className="mt-2 text-xs uppercase tracking-wider text-smoke">
            Known for {c.signatureAttributes.map((a) => attributeInfo(a).name).join(' & ')}
          </p>
        </OptionCard>
      ))}
    </OptionGroup>
  );
}

export function BackgroundStep({ draft, update }: StepProps) {
  return (
    <OptionGroup label="Background" className="sm:grid-cols-2">
      {backgrounds.map((b) => (
        <OptionCard key={b.id} name="background" value={b.id} checked={draft.backgroundId === b.id} onSelect={(backgroundId) => update({ backgroundId })} title={b.name}>
          <p className="font-serif text-base italic text-ash">{b.lore}</p>
          <p className="mt-2 text-ink">{b.storyEffect}</p>
          <p className="mt-1 text-xs uppercase tracking-wider text-smoke">Starting gear: {b.startingGear.join(', ')}</p>
        </OptionCard>
      ))}
    </OptionGroup>
  );
}

export function AppearanceStep({ draft, update, error }: StepProps) {
  const setTincture = (tinctureId: string) => update({ appearance: { ...draft.appearance, tinctureId } });
  return (
    <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="flex justify-center">
        <Crest tinctureId={draft.appearance.tinctureId} classId={draft.classId} size="xl" />
      </div>
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-ink">Crest colour</legend>
          <div role="radiogroup" aria-label="Crest colour" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {tinctures.map((t) => {
              const checked = draft.appearance.tinctureId === t.id;
              return (
                <label
                  key={t.id}
                  className={cn(
                    'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border p-2 transition-colors',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-300',
                    checked ? 'border-gold-300 bg-gold-600/20' : 'border-iron bg-obsidian hover:border-gold-600',
                  )}
                >
                  <input type="radio" name="tincture" value={t.id} checked={checked} onChange={() => setTincture(t.id)} className="sr-only" />
                  <span className="size-6 rounded-full ring-1 ring-gold-500/60" style={{ backgroundColor: t.hex }} aria-hidden />
                  <span className="text-xs text-ink">{t.name}</span>
                  <span className="sr-only">({t.description})</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <TextArea
          label="Appearance (optional)"
          value={draft.appearance.description}
          onChange={(e) => update({ appearance: { ...draft.appearance, description: e.target.value } })}
          maxLength={rules.freeTextMaxLength}
          placeholder="Ink-stained fingers, a travel-worn cloak…"
          error={error}
        />
      </div>
    </div>
  );
}

export function StoryStep({ draft, update, error }: StepProps) {
  const p = draft.personality;
  const set = (patch: Partial<CharacterDraft['personality']>) => update({ personality: { ...p, ...patch } });
  return (
    <div className="space-y-5">
      <TextArea label="Ideals" hint="What do you believe in?" value={p.ideals} onChange={(e) => set({ ideals: e.target.value })} maxLength={rules.freeTextMaxLength} placeholder="What is written endures." />
      <TextArea label="Bonds" hint="Who or what are you loyal to?" value={p.bonds} onChange={(e) => set({ bonds: e.target.value })} maxLength={rules.freeTextMaxLength} placeholder="The tablet house where I learned my signs." />
      <TextArea label="Motivation" hint="Why do you seek knowledge?" value={p.motivation} onChange={(e) => set({ motivation: e.target.value })} maxLength={rules.freeTextMaxLength} error={error} placeholder="To understand how the first cities rose." />
    </div>
  );
}

/** Step indexes used by "Change" links on the review screen. */
const stepIndex = { name: 0, race: 1, class: 2, background: 3, appearance: 4, story: 5 } as const;

export function ReviewStep({ draft, onEdit }: { draft: CharacterDraft; onEdit: (stepIndex: number) => void }) {
  const race = findRace(draft.raceId);
  const cls = findClass(draft.classId);
  const bg = findBackground(draft.backgroundId);
  const scores = startingAttributes();
  const story = [draft.personality.ideals, draft.personality.bonds, draft.personality.motivation].filter((s) => s.trim()).length;

  const rows: Array<{ label: string; value: string; step: number; detail?: string | undefined }> = [
    { label: 'Name', value: draft.name.trim(), step: stepIndex.name },
    { label: 'Race', value: race?.name ?? '—', step: stepIndex.race, detail: race && `${race.trait.name}: ${race.trait.description}` },
    { label: 'Class', value: cls?.name ?? '—', step: stepIndex.class, detail: cls && `${cls.ability.name}: ${cls.ability.description}` },
    { label: 'Background', value: bg?.name ?? '—', step: stepIndex.background, detail: bg && `Gear: ${bg.startingGear.join(', ')}` },
    { label: 'Crest', value: findTincture(draft.appearance.tinctureId)?.name ?? '—', step: stepIndex.appearance },
    { label: 'Story', value: story === 0 ? 'Not written (optional)' : `${story} of 3 answered`, step: stepIndex.story },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 rounded-panel border border-gold-600 bg-obsidian p-6 text-center sm:flex-row sm:text-left">
        <Crest tinctureId={draft.appearance.tinctureId} classId={draft.classId} size="lg" />
        <div>
          <p className="font-display text-2xl font-semibold text-gold-100">{draft.name.trim()}</p>
          <p className="mt-1 text-ash">
            {race?.name} {cls?.name} · {bg?.name}
          </p>
          <Badge tone="gold" className="mt-3">Level 1</Badge>
        </div>
      </div>

      <dl className="divide-y divide-iron/70 rounded-panel border border-iron bg-obsidian">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wider text-smoke">{r.label}</dt>
              <dd className="mt-0.5 text-ink">{r.value}</dd>
              {r.detail && <dd className="mt-0.5 text-sm text-ash">{r.detail}</dd>}
            </div>
            <Button variant="ghost" className="shrink-0 text-gold-300" onClick={() => onEdit(r.step)} aria-label={`Change ${r.label.toLowerCase()}`}>
              Change
            </Button>
          </div>
        ))}
      </dl>

      <div>
        <h2 className="font-display text-lg font-semibold text-gold-200">Attributes</h2>
        <p className="mt-1 text-sm text-ash">
          Every adventurer begins at 1. Your scores rise only when you demonstrate real knowledge in the areas each attribute represents.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {attributeIds.map((id) => (
            <AttributeTile key={id} id={id} score={scores[id]} signature={cls?.signatureAttributes.includes(id) ?? false} />
          ))}
        </div>
      </div>
    </div>
  );
}
