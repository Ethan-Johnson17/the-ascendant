import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { ProgressBar } from '../components/ui/ProgressBar.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { validateDraft, type CharacterDraft, type DraftField } from '../engine/character/createCharacter.ts';
import { characterCatalog } from '../content/character/options.ts';
import { creationSteps, type StepId } from '../features/character/creation/steps.ts';
import { NameStep, RaceStep, ClassStep, BackgroundStep, AppearanceStep, StoryStep, ReviewStep } from '../features/character/creation/StepViews.tsx';
import { duration, easeAscend } from '../styles/motion.ts';

const emptyDraft: CharacterDraft = {
  name: '',
  raceId: '',
  classId: '',
  backgroundId: '',
  appearance: { tinctureId: 'or', description: '' },
  personality: { ideals: '', bonds: '', motivation: '' },
};

/** Which validation fields each step is responsible for. */
const stepFields: Record<StepId, DraftField[]> = {
  name: ['name'],
  race: ['raceId'],
  class: ['classId'],
  background: ['backgroundId'],
  appearance: ['appearance'],
  story: ['personality'],
  review: [],
};

export default function CreateCharacterPage() {
  const { createCharacter } = useGame();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set when the player changes step; the next step's heading takes focus as soon as it mounts
  // (after the exit animation), so keyboard and screen-reader users land on the new content.
  const focusOnMount = useRef(false);

  const step = creationSteps[index] ?? creationSteps[0]!;
  const issues = useMemo(() => validateDraft(draft, characterCatalog), [draft]);
  const stepIssue = issues.find((i) => stepFields[step.id].includes(i.field));
  const isLast = index === creationSteps.length - 1;

  const update = (patch: Partial<CharacterDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const go = (delta: number) => {
    setDirection(delta);
    setIndex((i) => Math.min(creationSteps.length - 1, Math.max(0, i + delta)));
    focusOnMount.current = true;
  };

  const submit = () => {
    const result = createCharacter(draft);
    if (result.ok) navigate('/', { replace: true });
    else setSubmitError(result.issues.map((i) => i.message).join(' '));
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-4">
        <ButtonLink to="/welcome" variant="ghost" className="-ml-3" icon={<ChevronLeft className="size-4" aria-hidden />}>
          Leave
        </ButtonLink>
        <p className="text-xs uppercase tracking-[0.25em] text-gold-500">
          Step {index + 1} of {creationSteps.length}
        </p>
      </div>
      <ProgressBar value={index + 1} max={creationSteps.length} label="Character creation progress" className="mt-3" />

      <form
        className="mt-8 flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (stepIssue) return;
          if (isLast) submit();
          else go(1);
        }}
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={step.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: duration.base, ease: easeAscend }}
            aria-labelledby="step-title"
            className="flex-1"
          >
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-gold-500">{step.eyebrow}</p>
            <h1 id="step-title" ref={(el) => {
              if (el && focusOnMount.current) {
                focusOnMount.current = false;
                el.focus();
              }
            }} tabIndex={-1} className="mt-2 font-display text-3xl font-semibold tracking-wide text-gold-200 focus:outline-none sm:text-4xl">
              {step.title}
            </h1>
            <p className="mt-2 max-w-2xl font-serif text-lg text-ash">{step.intro}</p>
            <div className="mt-6">
              {step.id === 'name' && <NameStep draft={draft} update={update} error={stepIssue?.message} />}
              {step.id === 'race' && <RaceStep draft={draft} update={update} />}
              {step.id === 'class' && <ClassStep draft={draft} update={update} />}
              {step.id === 'background' && <BackgroundStep draft={draft} update={update} />}
              {step.id === 'appearance' && <AppearanceStep draft={draft} update={update} error={stepIssue?.message} />}
              {step.id === 'story' && <StoryStep draft={draft} update={update} error={stepIssue?.message} />}
              {step.id === 'review' && <ReviewStep draft={draft} onEdit={(target) => go(target - index)} />}
            </div>
          </motion.section>
        </AnimatePresence>

        {submitError && (
          <Notice tone="warning" className="mt-6">
            {submitError}
          </Notice>
        )}

        <div className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-between gap-3 border-t border-iron/60 bg-abyss/90 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          <Button variant="secondary" onClick={() => go(-1)} disabled={index === 0} icon={<ChevronLeft className="size-4" aria-hidden />}>
            Back
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            {stepIssue && !['name', 'appearance', 'story'].includes(step.id) && <p className="hidden text-sm text-smoke sm:block">{stepIssue.message}</p>}
            <Button type="submit" size={isLast ? 'lg' : 'md'} disabled={Boolean(stepIssue)}>
              {isLast ? 'Begin your ascent' : 'Continue'}
              {!isLast && <ChevronRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
