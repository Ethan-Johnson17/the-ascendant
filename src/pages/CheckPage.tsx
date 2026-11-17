import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardCheck, FlaskConical, Library, RotateCcw, Sparkles, Target, X } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { LearningGate, SampleNote } from '../features/learning/LearningUi.tsx';
import { useCampaignLearning } from '../features/learning/useCampaignLearning.ts';
import { ItemInput, allAnswered, describeAnswer } from '../features/learning/ItemInput.tsx';
import { masteryStages } from '../engine/character/attributeGrowth.ts';
import { defaultLearningConfig, difficultyNames, errorCategoryNames, type Difficulty } from '../engine/learning/config.ts';
import type { Answer } from '../engine/learning/grading.ts';
import type { CampaignLearning, CheckView } from '../services/learning/learningData.ts';
import type { CheckResult, IssuedItem, StartedCheck } from '../services/learning/learningClient.ts';
import { cn } from '../utils/cn.ts';

type Phase = { name: 'intro' } | { name: 'answering'; check: StartedCheck } | { name: 'result'; check: StartedCheck; result: CheckResult; answers: Record<string, Answer> };

export default function CheckPage() {
  const { campaignId, checkKey } = useParams();
  const { campaign, load, reload, api, isSample } = useCampaignLearning(campaignId);
  const game = useGame();
  const [phase, setPhase] = useState<Phase>({ name: 'intro' });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <LearningGate load={load} onRetry={() => void reload()}>
      {(data) => {
        const check = [...data.activities.values()].find((a): a is CheckView => a.kind === 'assessment' && a.key === checkKey);
        if (!check) return <Notice tone="warning" title="Check not found">This check isn’t part of the campaign.</Notice>;
        const back = `/campaigns/${campaign!.id}`;

        const start = async () => {
          if (!api || busy) return;
          setBusy(true);
          setError(null);
          const r = await api.startCheck(campaign!.id, check.id);
          setBusy(false);
          if (!r.ok) return setError(r.error);
          setAnswers(Object.fromEntries(r.data.items.filter((i) => i.kind === 'ordering').map((i) => [i.key, (i as Extract<IssuedItem, { kind: 'ordering' }>).entries.map((e) => e.key)])));
          setPhase({ name: 'answering', check: r.data });
          window.scrollTo(0, 0);
        };

        const submit = async (started: StartedCheck) => {
          if (!api || busy) return;
          setBusy(true);
          setError(null);
          const r = await api.submitCheck(started.attemptId, answers);
          setBusy(false);
          if (!r.ok) return setError(r.error);
          setPhase({ name: 'result', check: started, result: r.data, answers });
          window.scrollTo(0, 0);
          await Promise.all([reload(), game.reload()]);
        };

        return (
          <div className="space-y-6">
            <Link to={back} className="inline-flex min-h-11 items-center gap-2 text-sm text-ash hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> Back to campaign
            </Link>
            <PageHeader eyebrow={`Knowledge check · proves ${check.targetStageName}`} title={check.title} />
            {isSample && <SampleNote />}
            {error && <Notice tone="warning">{error}</Notice>}

            {phase.name === 'intro' && <Intro check={check} data={data} canStart={!!api && campaign!.status === 'active'} paused={campaign!.status === 'paused'} busy={busy} onStart={() => void start()} />}

            {phase.name === 'answering' && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(phase.check);
                }}
              >
                <p className="text-sm text-ash">
                  {phase.check.items.length} questions · {difficultyNames[phase.check.difficulty as Difficulty]} difficulty. Pass mark {Math.round(defaultLearningConfig.mastery.passMark * 100)}%.
                </p>
                <WrittenNote count={phase.check.items.filter((i) => i.kind === 'written').length} />
                {phase.check.items.map((item, i) => (
                  <Panel key={item.key} as="section" tone="raised">
                    <p className="text-xs uppercase tracking-wider text-gold-500">Question {i + 1}</p>
                    <h2 className="mt-1 font-serif text-xl leading-snug text-ink">{item.prompt}</h2>
                    <div className="mt-4">
                      <ItemInput item={item} value={answers[item.key]} onChange={(v) => setAnswers((a) => ({ ...a, [item.key]: v }))} />
                    </div>
                  </Panel>
                ))}
                <AnsweredHint items={phase.check.items} answers={answers} />
                <Button type="submit" size="lg" disabled={busy || !allAnswered(phase.check.items, answers)} icon={<Check className="size-5" aria-hidden />}>
                  {busy ? 'Marking…' : 'Submit answers'}
                </Button>
              </form>
            )}

            {phase.name === 'result' && (
              <Result
                data={data}
                started={phase.check}
                result={phase.result}
                answers={phase.answers}
                campaignId={campaign!.id}
                onRetry={() => {
                  setPhase({ name: 'intro' });
                  setAnswers({});
                }}
              />
            )}
          </div>
        );
      }}
    </LearningGate>
  );
}

function AnsweredHint({ items, answers }: { items: readonly IssuedItem[]; answers: Record<string, Answer> }) {
  const left = items.filter((i) => !allAnswered([i], answers)).length;
  return left > 0 ? <p className="text-sm text-ash" aria-live="polite">{left} question{left > 1 ? 's' : ''} still to answer.</p> : null;
}

/** Says plainly that written answers are marked by an AI, and what that costs. */
function WrittenNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Notice tone="info" title="Written answers are marked by the Examiner (AI)">
      The Examiner checks your {count === 1 ? 'answer' : 'answers'} against a rubric, and the game adds up the points. This uses {count} of your daily AI
      requests. If the Examiner isn’t sure how to mark an answer, the attempt won’t count either way, and you can simply try again.
    </Notice>
  );
}

function Intro({ check, data, canStart, paused, busy, onStart }: { check: CheckView; data: CampaignLearning; canStart: boolean; paused: boolean; busy: boolean; onStart: () => void }) {
  const comps = data.competencies.filter((c) => check.competencyIds.includes(c.id));
  return (
    <Panel tone="accent">
      <ul className="space-y-2 text-ink">
        <li>
          {check.questionCount} questions, chosen for you by the game
          {check.writtenCount > 0 && (check.writtenCount >= check.questionCount ? ', all of them written answers' : `, including ${check.writtenCount} written answer${check.writtenCount > 1 ? 's' : ''}`)}.
        </li>
        {check.writtenCount > 0 && (
          <li>
            Written answers are marked by the Examiner (AI) against a rubric.{' '}
            {check.writtenCount < check.questionCount && 'If the Examiner isn’t available, the check is given without them.'}
          </li>
        )}
        <li>Score {Math.round(defaultLearningConfig.mastery.passMark * 100)}% or more to pass.</li>
        <li>
          Passing on {defaultLearningConfig.mastery.passesRequired} different days (at least {defaultLearningConfig.mastery.minHoursBetweenPasses} hours apart) raises{' '}
          {comps.map((c) => c.name).join(' and ')} to <strong className="text-gold-200">{check.targetStageName}</strong>.
        </li>
        <li>XP is paid the first time you pass. Mistakes go to your Weakness Bank for review; they never cost you progress.</li>
      </ul>
      {check.passes > 0 && <p className="mt-3 text-sm text-ash">You’ve passed this check {check.passes}× (best {Math.round((check.bestScore ?? 0) * 100)}%).</p>}
      {!check.unlocked && (
        <Notice tone="warning" className="mt-4">
          {check.bossLocked
            ? `This check is locked. Beat the ${masteryStages[check.targetStage - 2]} boss on the campaign page first.`
            : `This check is locked. Reach ${masteryStages[check.targetStage - 2]} first.`}
        </Notice>
      )}
      {paused && <Notice tone="warning" className="mt-4">This campaign is paused. Resume it to take checks.</Notice>}
      <div className="mt-5">
        {canStart && check.unlocked && (
          <Button size="lg" disabled={busy} onClick={onStart} icon={<ClipboardCheck className="size-5" aria-hidden />}>
            {busy ? 'Preparing…' : 'Begin check'}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function Result({ data, started, result, answers, campaignId, onRetry }: { data: CampaignLearning; started: StartedCheck; result: CheckResult; answers: Record<string, Answer>; campaignId: string; onRetry: () => void }) {
  const items = new Map(started.items.map((i) => [i.key, i] as const));
  const compName = (id: string) => data.competencies.find((c) => c.id === id)?.name ?? id;
  const conceptName = (id: string) => data.codex.find((c) => c.id === id)?.title ?? id;
  const opened = result.weaknesses.filter((w) => w.event === 'opened' || w.event === 'reopened' || w.event === 'mistake_repeated');
  const cleared = result.weaknesses.filter((w) => w.event === 'resolved');
  const counted = result.weaknesses.filter((w) => w.event === 'review_counted');

  return (
    <div className="space-y-6" aria-live="polite">
      <Panel tone="accent">
        <div className="flex flex-wrap items-center gap-3">
          {result.counted ? <Badge tone={result.passed ? 'vital' : 'warning'}>{result.passed ? 'Passed' : 'Not yet'}</Badge> : <Badge tone="warning">Didn’t count</Badge>}
          {result.xp.total > 0 && <Badge tone="gold"><Sparkles className="size-3" aria-hidden />+{result.xp.total} XP</Badge>}
          {result.examinerOrigin === 'fixture' && <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture marking</Badge>}
        </div>
        {!result.counted && (
          <Notice tone="warning" className="mt-3" title="This attempt didn’t count">
            The Examiner wasn’t confident about how to mark a written answer, so this attempt changes nothing: no pass or fail, no XP, and nothing added to
            your Weakness Bank. You can take the check again.
          </Notice>
        )}
        <p className="mt-3 font-display text-4xl font-semibold text-gold-100">{result.correct} / {result.total}</p>
        <p className="text-ash">{Math.round(result.score * 100)}% · pass mark {Math.round(defaultLearningConfig.mastery.passMark * 100)}%</p>
        <ul className="mt-4 space-y-1.5 text-ink">
          {result.counted && result.competencies.map((c) => (
            <li key={c.competencyId}>
              {c.advanced ? (
                <strong className="text-gold-200">{compName(c.competencyId)} rose to {masteryStages[c.stage - 1]}!</strong>
              ) : (
                <span>
                  {compName(c.competencyId)}: {masteryStages[c.stage - 1]}.{' '}
                  {c.progress.reason ?? capNote(c.stage)}
                </span>
              )}
              {c.reviewedWhileDue && <span className="text-ash"> Review completed on time.</span>}
            </li>
          ))}
          {result.passed && result.xp.total === 0 && <li className="text-ash">No XP this time: XP is paid for the first pass, and for reviews when they are due.</li>}
          {result.counted && !result.passed && <li className="text-ash">No progress lost. Review the explanations below and try again.</li>}
        </ul>
        {(opened.length > 0 || counted.length > 0 || cleared.length > 0) && (
          <div className="mt-4 rounded-control border border-iron bg-obsidian/60 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-gold-200"><Target className="size-4" aria-hidden />Weakness Bank</p>
            {opened.length > 0 && <p className="mt-1 text-ash">Added for review: {opened.map((w) => conceptName(w.conceptId)).join(', ')}.</p>}
            {counted.length > 0 && <p className="mt-1 text-ash">Review counted: {counted.map((w) => conceptName(w.conceptId)).join(', ')}.</p>}
            {cleared.length > 0 && <p className="mt-1 text-vital">Cleared: {cleared.map((w) => conceptName(w.conceptId)).join(', ')}.</p>}
          </div>
        )}
      </Panel>

      <section aria-labelledby="review-answers" className="space-y-3">
        <h2 id="review-answers" className="font-display text-xl font-semibold text-gold-200">Your answers</h2>
        {result.results.map((r, i) => {
          const item = items.get(r.itemId);
          if (!item) return null;
          return (
            <Panel key={r.itemId} as="article" tone="raised" className={cn(r.correct ? 'border-vital/40' : 'border-warning/40')}>
              <p className="flex items-center gap-2 text-xs uppercase tracking-wider">
                {r.correct ? <Check className="size-4 text-vital" aria-hidden /> : <X className="size-4 text-warning" aria-hidden />}
                <span className={r.correct ? 'text-vital' : 'text-warning'}>Question {i + 1}: {r.correct ? 'correct' : 'not quite'}</span>
                {!r.correct && r.errorCategory && <span className="text-smoke">· {errorCategoryNames[r.errorCategory]}</span>}
              </p>
              <p className="mt-1 font-serif text-lg text-ink">{item.prompt}</p>
              {r.written ? (
                <WrittenReview written={r.written} given={describeAnswer(item, answers[r.itemId])} modelAnswer={typeof r.answer === 'string' ? r.answer : ''} />
              ) : (
                <>
                  {!r.correct && <p className="mt-2 text-sm text-ash">Your answer: {describeAnswer(item, answers[r.itemId])}</p>}
                  <p className="mt-1 text-sm text-gold-200">Answer: {describeAnswer(item, r.answer)}</p>
                </>
              )}
              <p className="mt-2 text-sm text-ink/90">{r.explanation}</p>
            </Panel>
          );
        })}
      </section>

      <div className="flex flex-wrap gap-3">
        <ButtonLink to={`/campaigns/${campaignId}`} size="lg" icon={<ArrowLeft className="size-5" aria-hidden />}>Back to campaign</ButtonLink>
        <Button size="lg" variant="secondary" onClick={onRetry} icon={<RotateCcw className="size-5" aria-hidden />}>Take it again</Button>
        <ButtonLink to={`/codex?campaign=${campaignId}`} size="lg" variant="ghost" icon={<Library className="size-5" aria-hidden />}>Open Codex</ButtonLink>
      </div>
    </div>
  );
}

/** Why a stage didn't move although the check was passed: it's as high as this kind of check goes. */
function capNote(stage: number): string {
  if (stage >= defaultLearningConfig.mastery.maxStageFromWritten) return 'Higher stages need applied work, coming in later phases.';
  if (stage >= defaultLearningConfig.mastery.maxStageFromChecks) return 'Advanced needs this campaign’s Advanced check, which uses written answers.';
  return '';
}

type WrittenResult = NonNullable<CheckResult['results'][number]['written']>;

/** The rubric, criterion by criterion, with the Examiner's quotes and feedback. */
function WrittenReview({ written, given, modelAnswer }: { written: WrittenResult; given: string; modelAnswer: string }) {
  return (
    <div className="mt-2 space-y-3 text-sm">
      <div>
        <p className="text-ash">Your answer:</p>
        <p className="mt-1 whitespace-pre-wrap rounded-control border border-iron bg-obsidian/60 p-3 text-ink">{given}</p>
      </div>
      {written.marked ? (
        <div>
          <p className="text-ash">
            Marked by the Examiner (AI): {written.earned} of {written.total} points, {written.required} needed.
            {!written.confident && <span className="text-warning"> The Examiner wasn’t sure about this one.</span>}
          </p>
          <ul className="mt-2 space-y-1.5">
            {written.criteria.map((c) => (
              <li key={c.key} className="flex gap-2">
                {c.met ? <Check className="mt-0.5 size-4 shrink-0 text-vital" aria-label="Met" /> : <X className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Not met" />}
                <span className="text-ink">
                  {c.description} <span className="text-smoke">({c.points} pt{c.points > 1 ? 's' : ''})</span>
                  {c.met && c.quote && <span className="block text-ash">You wrote: “{c.quote}”</span>}
                </span>
              </li>
            ))}
          </ul>
          {written.feedback && <p className="mt-2 text-ink/90">{written.feedback}</p>}
        </div>
      ) : (
        <p className="text-ash">No answer was given, so it wasn’t sent to the Examiner.</p>
      )}
      {modelAnswer && <p className="text-gold-200">A good answer: {modelAnswer}</p>}
    </div>
  );
}
