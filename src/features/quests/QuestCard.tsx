import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Circle, FlaskConical, Lightbulb, Lock, ScrollText, Sparkles } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { createAiClient } from '../../services/ai/aiClient.ts';
import type { QuestStoryView, QuestView } from '../../services/learning/learningClient.ts';
import { cn } from '../../utils/cn.ts';
import { activityKey } from './useQuests.ts';

export const questKindLabel: Record<QuestView['kind'], string> = {
  learn: 'Learning quest',
  deepen: 'Mastery quest',
  prepare: 'Boss preparation',
  review: 'Review quest',
  retention: 'Retention quest',
};
const difficultyLabel = ['', 'Easy', 'Moderate', 'Hard'] as const;

type Link = QuestView['objectives'][number]['link'];
function hrefFor(link: Link, campaignId: string): string {
  if (link.kind === 'lesson') return `/campaigns/${campaignId}/lesson/${activityKey(link.activityId)}`;
  if (link.kind === 'check') return `/campaigns/${campaignId}/check/${activityKey(link.activityId)}`;
  if (link.kind === 'weaknesses') return `/weaknesses?campaign=${campaignId}`;
  return `/campaigns/${campaignId}`;
}

type StoryState = { state: 'idle' } | { state: 'busy' } | { state: 'error'; message: string };

/** One quest: the game's objectives and reward, with the Game Master's story when the player asks. */
export function QuestCard({ quest, campaignId, campaignActive, onStory }: { quest: QuestView; campaignId: string; campaignActive: boolean; onStory: () => void }) {
  const { client } = useAuth();
  const api = useMemo(() => (client ? createAiClient(client) : null), [client]);
  const navigate = useNavigate();
  const [story, setStory] = useState<QuestStoryView | null>(quest.story);
  const [storyOpen, setStoryOpen] = useState(true);
  const [ask, setAsk] = useState<StoryState>({ state: 'idle' });
  const done = quest.objectives.filter((o) => o.done).length;
  const next = quest.objectives.find((o) => !o.done);
  const locked = quest.status === 'locked';
  const completed = quest.status === 'completed';

  const tell = async () => {
    if (!api) return;
    setAsk({ state: 'busy' });
    const r = await api.narrateQuest(campaignId, quest.key);
    if (!r.ok) return setAsk({ state: 'error', message: r.error });
    setStory(r.data.story);
    setStoryOpen(true);
    setAsk({ state: 'idle' });
    onStory();
  };

  const choose = (actionId: string) => {
    if (actionId === 'begin' && next) navigate(hrefFor(next.link, campaignId));
    else setStoryOpen(false);
  };

  return (
    <article className={cn('rounded-panel border p-4 sm:p-5', completed ? 'border-iron/60 bg-obsidian/40' : locked ? 'border-iron/60 bg-obsidian/30' : 'border-iron bg-charcoal')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={quest.kind === 'prepare' ? 'gold' : quest.kind === 'review' ? 'warning' : quest.kind === 'retention' ? 'arcane' : 'neutral'}>{questKindLabel[quest.kind]}</Badge>
        <Badge>{difficultyLabel[quest.difficulty]}</Badge>
        <Badge tone="gold">{quest.xp} XP</Badge>
        {completed && <Badge tone="vital"><Check className="size-3" aria-hidden />Completed</Badge>}
        {locked && <Badge><Lock className="size-3" aria-hidden />Locked</Badge>}
      </div>
      <h3 className="mt-2 font-serif text-xl leading-snug text-ink">{quest.title}</h3>
      <p className="mt-1 text-sm text-ash">{quest.summary}</p>
      {locked && quest.lockedReason && <p className="mt-2 text-sm text-smoke">{quest.lockedReason}</p>}

      {story && storyOpen && (
        <div className="mt-4 rounded-control border border-gold-700/40 bg-obsidian/60 p-4">
          <p className="mb-2">
            {story.origin === 'fixture'
              ? <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture</Badge>
              : <Badge tone="arcane"><Sparkles className="size-3" aria-hidden />Game Master (AI)</Badge>}
          </p>
          <div className="space-y-2 font-serif text-ink">{story.narration.map((p, i) => <p key={i}>{p}</p>)}</div>
          {story.dialogue.map((d, i) => (
            <blockquote key={i} className="mt-3 border-l-2 border-gold-600 pl-3 text-ink">
              <span className="text-xs uppercase tracking-wider text-gold-300">{d.name}</span>
              <p className="font-serif italic">“{d.line}”</p>
            </blockquote>
          ))}
          {!completed && !locked && (
            <div className="mt-4 flex flex-wrap gap-2">
              {story.choices.map((c, i) => (
                <Button key={c.actionId} variant={i === 0 ? 'primary' : 'ghost'} onClick={() => choose(c.actionId)} disabled={c.actionId === 'begin' && !next}>{c.label}</Button>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-smoke">The story is for flavour. The steps below are the quest; the game checks them from your records.</p>
        </div>
      )}

      {!locked && (
        <>
          <ProgressBar className="mt-4" value={done} max={quest.objectives.length} label={`${quest.title} progress`} caption={`${done} of ${quest.objectives.length} steps`} tone={completed ? 'vital' : 'gold'} />
          <ul className="mt-3 space-y-2">
            {quest.objectives.map((o) => (
              <li key={o.id} className="flex min-h-11 items-center gap-3">
                {o.done ? <Check className="size-5 shrink-0 text-vital" aria-label="Done" /> : <Circle className="size-5 shrink-0 text-smoke" aria-label="Not done" />}
                <span className={cn('flex-1', o.done ? 'text-ash' : 'text-ink')}>{o.label}</span>
                {!o.done && !completed && (
                  <ButtonLink to={hrefFor(o.link, campaignId)} variant="ghost" className="shrink-0" icon={<ChevronRight className="size-4" aria-hidden />}>Go</ButtonLink>
                )}
              </li>
            ))}
          </ul>
          {!completed && quest.hints.length > 0 && (
            <details className="mt-3 text-sm text-ash">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-gold-200"><Lightbulb className="size-4" aria-hidden />Hints</summary>
              <ul className="ml-6 list-disc space-y-1">{quest.hints.map((h) => <li key={h}>{h}</li>)}</ul>
            </details>
          )}
        </>
      )}

      {!locked && !completed && campaignActive && api && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {story ? (
            !storyOpen && <Button variant="ghost" onClick={() => setStoryOpen(true)} icon={<ScrollText className="size-4" aria-hidden />}>Show the story</Button>
          ) : (
            <>
              <Button variant="ghost" disabled={ask.state === 'busy'} onClick={() => void tell()} icon={<ScrollText className="size-4" aria-hidden />}>
                {ask.state === 'busy' ? 'The Guide is speaking…' : 'Hear the Guide’s story'}
              </Button>
              <span className="text-xs text-smoke">The Game Master (AI) tells this quest’s story once. Uses 1 of your daily AI requests.</span>
            </>
          )}
        </div>
      )}
      {ask.state === 'error' && <Notice tone="warning" className="mt-3">{ask.message}</Notice>}
    </article>
  );
}
