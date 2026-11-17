import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Cog, FlaskConical, Shield, ShieldOff, Sparkles, Swords, Trophy, X } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { ProgressBar } from '../components/ui/ProgressBar.tsx';
import { ItemInput, allAnswered, describeAnswer } from '../features/learning/ItemInput.tsx';
import { bossStageName, useBosses } from '../features/bosses/useBosses.ts';
import { bossConfig } from '../engine/encounters/boss.ts';
import type { Answer } from '../engine/learning/grading.ts';
import type { BattleView, BossAnswerResult, IssuedItem } from '../services/learning/learningClient.ts';
import { cn } from '../utils/cn.ts';

type Feedback = { result: BossAnswerResult['result']; question: IssuedItem; given: Answer | null; next: BattleView };
type Phase =
  | { name: 'waiting' }
  | { name: 'ready' }
  | { name: 'intro'; battle: BattleView }
  | { name: 'question'; battle: BattleView }
  | { name: 'feedback'; battle: BattleView; feedback: Feedback }
  | { name: 'ended'; battle: BattleView; xp: number };

const weaknessNote: Record<string, string> = {
  opened: 'Added to your Weakness Bank for review.',
  reopened: 'Back in your Weakness Bank for review.',
  mistake_repeated: 'Already in your Weakness Bank; it will come back for review soon.',
  review_counted: 'Counted as a review of a weak spot.',
  resolved: 'A weak spot cleared from your Weakness Bank.',
};

/** A boss battle: the plan's story, one question at a time, Resolve, and the result. */
export default function BossPage() {
  const { campaignId, stage: stageParam } = useParams();
  const stage = Number(stageParam);
  const game = useGame();
  const campaign = game.player.campaigns.find((c) => c.id === campaignId);
  const { load, reload, api } = useBosses(campaignId);
  const [phase, setPhase] = useState<Phase>({ name: 'waiting' });
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boss = load.state === 'ready' ? load.data.bosses.find((b) => b.stage === stage) : undefined;
  const back = `/campaigns/${campaignId}`;
  const reloadGame = game.reload;

  const show = useCallback((battle: BattleView, intro = false) => {
    setAnswer(battle.question?.kind === 'ordering' ? battle.question.entries.map((e) => e.key) : undefined);
    if (battle.encounter.status !== 'active') return setPhase({ name: 'ended', battle, xp: 0 });
    setPhase(intro ? { name: 'intro', battle } : { name: 'question', battle });
  }, []);

  // Resume a battle under way, or wait for the player to begin.
  useEffect(() => {
    if (!api || !boss || phase.name !== 'waiting') return;
    if (boss.status === 'ready') return setPhase({ name: 'ready' });
    if (boss.status !== 'active') return;
    let live = true;
    void api.viewBoss(boss.encounterId).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      show(r.data, r.data.encounter.position === 0);
    });
    return () => {
      live = false;
    };
  }, [api, boss, phase.name, show]);

  const begin = async () => {
    if (!api || !campaignId || busy) return;
    setBusy(true);
    setError(null);
    const r = await api.startBoss(campaignId, stage);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    show(r.data, true);
    window.scrollTo(0, 0);
  };

  const submit = async (battle: BattleView) => {
    if (!api || busy || !battle.question) return;
    setBusy(true);
    setError(null);
    const r = await api.answerBoss(battle.encounter.id, battle.encounter.position, answer ?? null);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const { result, ...next } = r.data;
    setPhase({ name: 'feedback', battle: next, feedback: { result, question: battle.question, given: answer ?? null, next } });
    if (next.encounter.status !== 'active') void reloadGame();
  };

  const proceed = (f: Feedback) => {
    if (f.next.encounter.status !== 'active') {
      setPhase({ name: 'ended', battle: f.next, xp: f.result.xp });
      void reload();
    } else show(f.next);
    window.scrollTo(0, 0);
  };

  const title = phase.name !== 'waiting' && phase.name !== 'ready' ? phase.battle.encounter.plan.name : `The ${bossStageName(stage)} boss`;
  return (
    <div className="space-y-6">
      <Link to={back} className="inline-flex min-h-11 items-center gap-2 text-sm text-ash hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to campaign
      </Link>
      <PageHeader eyebrow={`Boss encounter · ${bossStageName(stage) || 'Unknown stage'}`} title={title} />
      {error && <Notice tone="warning">{error}</Notice>}

      {game.isSample && <Notice tone="fixture" title="Sample mode">Bosses need a signed-in player: battles are decided and recorded on the server.</Notice>}
      {!game.isSample && !campaign && <Notice tone="warning" title="Campaign not found">This campaign isn’t one of yours.</Notice>}
      {load.state === 'error' && <Notice tone="warning">{load.message}</Notice>}
      {load.state === 'ready' && !boss && <Notice tone="warning" title="No boss here">This course has no boss at that stage.</Notice>}
      {boss && phase.name === 'waiting' && boss.status === 'won' && (
        <Notice title="Already beaten">You have beaten this boss. <Link className="text-gold-200 underline" to={back}>Back to the campaign</Link>.</Notice>
      )}
      {boss && phase.name === 'waiting' && boss.status === 'locked' && <Notice tone="warning" title="Not open yet">{boss.reason}</Notice>}
      {boss && phase.name === 'waiting' && boss.status === 'recover' && (
        <Notice tone="warning" title="Recover first">
          Finish the recovery quest, then return. <Link className="text-gold-200 underline" to={`/campaigns/${campaignId}/quests`}>See your quests</Link>.
        </Notice>
      )}

      {phase.name === 'ready' && <Ready stage={stage} busy={busy} paused={load.state === 'ready' && load.data.campaignStatus !== 'active'} onBegin={() => void begin()} />}
      {phase.name === 'intro' && <Intro battle={phase.battle} onContinue={() => setPhase({ name: 'question', battle: phase.battle })} />}
      {phase.name === 'question' && phase.battle.question && (
        <QuestionView battle={phase.battle} question={phase.battle.question} answer={answer} onAnswer={setAnswer} busy={busy} onSubmit={() => void submit(phase.battle)} />
      )}
      {phase.name === 'feedback' && <FeedbackView feedback={phase.feedback} onContinue={() => proceed(phase.feedback)} />}
      {phase.name === 'ended' && <Ended battle={phase.battle} xp={phase.xp} campaignId={campaignId ?? ''} />}
    </div>
  );
}

function OriginBadge({ origin }: { origin: BattleView['encounter']['planOrigin'] }) {
  if (origin === 'ai') return <Badge tone="arcane"><Sparkles className="size-3" aria-hidden />Story by the Strategist (AI)</Badge>;
  if (origin === 'fixture') return <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture</Badge>;
  return <Badge><Cog className="size-3" aria-hidden />The game’s own plan</Badge>;
}

function ResolveMeter({ resolve, max }: { resolve: number; max: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Resolve: ${resolve} of ${max}`} role="img">
      <span className="text-xs uppercase tracking-wider text-smoke">Resolve</span>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <motion.span key={i} initial={false} animate={{ scale: i < resolve ? 1 : 0.85, opacity: i < resolve ? 1 : 0.4 }} transition={{ duration: 0.3 }}>
            {i < resolve ? <Shield className="size-5 text-gold-300" aria-hidden /> : <ShieldOff className="size-5 text-smoke" aria-hidden />}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function Ready({ stage, busy, paused, onBegin }: { stage: number; busy: boolean; paused: boolean; onBegin: () => void }) {
  return (
    <Panel eyebrow="Before you begin" title="How the battle works" tone="accent">
      <ul className="ml-5 list-disc space-y-1.5 text-ash">
        <li>The boss asks questions from this course’s checks, on every skill you have brought to {bossStageName(stage)}.</li>
        <li>You start with {bossConfig.startingResolve} Resolve. Each wrong answer costs 1. Answer the last question with Resolve left to win.</li>
        <li>Mistakes go into your Weakness Bank. If you lose, nothing you have earned is taken away: a recovery quest shows what to practise before trying again.</li>
        <li>You can leave and come back; the battle waits for you.</li>
      </ul>
      <Button className="mt-5" size="lg" onClick={onBegin} disabled={busy || paused} icon={<Swords className="size-5" aria-hidden />}>
        {busy ? 'The boss approaches…' : 'Begin the battle'}
      </Button>
      {paused && <p className="mt-2 text-sm text-smoke">Resume this campaign to face its bosses.</p>}
    </Panel>
  );
}

function Intro({ battle, onContinue }: { battle: BattleView; onContinue: () => void }) {
  const { plan, planOrigin } = battle.encounter;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Panel tone="accent">
        <div className="flex flex-wrap items-center gap-2"><OriginBadge origin={planOrigin} /></div>
        <p className="mt-3 font-display text-sm uppercase tracking-[0.25em] text-gold-400">{plan.epithet}</p>
        <div className="mt-3 space-y-3 font-serif text-lg leading-relaxed text-ink">{plan.intro.map((p, i) => <p key={i}>{p}</p>)}</div>
        <p className="mt-4 text-sm text-ash">{plan.rounds.length} rounds · {battle.encounter.total} questions · {battle.encounter.maxResolve} Resolve</p>
        {planOrigin !== 'game' && <p className="mt-1 text-xs text-smoke">The story is for flavour. The questions come from your course’s checks, and the game marks every answer.</p>}
        <Button className="mt-5" size="lg" onClick={onContinue} icon={<Swords className="size-5" aria-hidden />}>Face the first round</Button>
      </Panel>
    </motion.div>
  );
}

function currentRound(battle: BattleView) {
  let seen = 0;
  for (const [i, r] of battle.encounter.plan.rounds.entries()) {
    if (battle.encounter.position < seen + r.questionIds.length) return { round: r, index: i, first: battle.encounter.position === seen };
    seen += r.questionIds.length;
  }
  return null;
}

function QuestionView({ battle, question, answer, onAnswer, busy, onSubmit }: { battle: BattleView; question: IssuedItem; answer: Answer | undefined; onAnswer: (a: Answer) => void; busy: boolean; onSubmit: () => void }) {
  const e = battle.encounter;
  const at = currentRound(battle);
  return (
    <form
      className="space-y-5"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResolveMeter resolve={e.resolve} max={e.maxResolve} />
        <OriginBadge origin={e.planOrigin} />
      </div>
      <ProgressBar value={e.position} max={e.total} label="Battle progress" caption={`Question ${e.position + 1} of ${e.total}`} />
      {at && (
        <AnimatePresence mode="wait">
          <motion.div key={at.index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <p className="text-xs uppercase tracking-wider text-gold-500">Round {at.index + 1} · {at.round.competencyName}</p>
            <h2 className="font-display text-xl text-gold-200">{at.round.title}</h2>
            {at.first && at.round.narration && <p className="mt-2 font-serif text-ink">{at.round.narration}</p>}
          </motion.div>
        </AnimatePresence>
      )}
      <Panel as="section" tone="raised">
        <h3 className="font-serif text-xl leading-snug text-ink">{question.prompt}</h3>
        <div className="mt-4"><ItemInput item={question} value={answer} onChange={onAnswer} /></div>
      </Panel>
      <Button type="submit" size="lg" disabled={busy || answer === undefined || !allAnswered([question], { [question.key]: answer })} icon={<Check className="size-5" aria-hidden />}>
        {busy ? 'Marking…' : 'Answer'}
      </Button>
    </form>
  );
}

function FeedbackView({ feedback: f, onContinue }: { feedback: Feedback; onContinue: () => void }) {
  const e = f.next.encounter;
  const over = e.status !== 'active';
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="space-y-4">
      <ResolveMeter resolve={e.resolve} max={e.maxResolve} />
      <Panel tone="raised" className={cn(f.result.correct ? 'border-vital/50' : 'border-warning/50')}>
        <p className={cn('flex items-center gap-2 font-display text-lg', f.result.correct ? 'text-vital' : 'text-warning')}>
          {f.result.correct ? <Check className="size-5" aria-hidden /> : <X className="size-5" aria-hidden />}
          {f.result.correct ? 'A telling blow' : 'The boss strikes back: −1 Resolve'}
        </p>
        <p className="mt-3 font-serif text-ink">{f.question.prompt}</p>
        <dl className="mt-3 grid gap-2 text-sm">
          <div><dt className="text-smoke">Your answer</dt><dd className="text-ink">{describeAnswer(f.question, f.given)}</dd></div>
          {!f.result.correct && <div><dt className="text-smoke">Correct answer</dt><dd className="text-ink">{describeAnswer(f.question, f.result.answer)}</dd></div>}
        </dl>
        <p className="mt-3 text-sm text-ash">{f.result.explanation}</p>
        {f.result.weakness && weaknessNote[f.result.weakness] && <p className="mt-2 text-sm text-smoke">{weaknessNote[f.result.weakness]}</p>}
      </Panel>
      <Button size="lg" onClick={onContinue}>{over ? 'See the outcome' : 'Next question'}</Button>
    </motion.div>
  );
}

function Ended({ battle, xp, campaignId }: { battle: BattleView; xp: number; campaignId: string }) {
  const e = battle.encounter;
  const won = e.status === 'won';
  const right = e.answered.filter((a) => a.correct).length;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <Panel tone="accent" className={won ? '' : 'border-warning/60'}>
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="flex items-center gap-3">
          {won ? <Trophy className="size-10 text-gold-300" aria-hidden /> : <ShieldOff className="size-10 text-warning" aria-hidden />}
          <div>
            <p className="font-display text-2xl text-gold-200">{won ? 'Victory' : 'Defeat'}</p>
            <p className="text-sm text-ash">{right} of {e.answered.length} answered correctly · {e.resolve} Resolve left</p>
          </div>
        </motion.div>
        <p className="mt-4 font-serif text-lg leading-relaxed text-ink">{won ? e.plan.victory : e.plan.defeat}</p>
        {won ? (
          <div className="mt-4 space-y-1 text-ash">
            {xp > 0 && <p className="text-gold-200">+{xp} XP</p>}
            <p>{e.stage < 4 ? `The ${bossStageName(e.stage + 1)} checks are now open.` : 'The Advanced checks are now open.'}</p>
          </div>
        ) : (
          <p className="mt-4 text-ash">Nothing you have earned is lost. Your mistakes are in the Weakness Bank, and a recovery quest shows what to practise before you try again.</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink to={`/campaigns/${campaignId}`}>Back to the campaign</ButtonLink>
          {!won && <ButtonLink to={`/campaigns/${campaignId}/quests`} variant="secondary">See the recovery quest</ButtonLink>}
        </div>
      </Panel>
    </motion.div>
  );
}
