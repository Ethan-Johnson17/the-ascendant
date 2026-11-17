import { Trophy } from 'lucide-react';
import { Panel } from '../../components/ui/Panel.tsx';
import { ButtonLink } from '../../components/ui/Button.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { questKindLabel } from './QuestCard.tsx';
import { useQuests } from './useQuests.ts';

/** The campaign page's view of its quests: the next two open quests and a link to all of them. */
export function QuestSummaryPanel({ campaignId }: { campaignId: string }) {
  const { load } = useQuests(campaignId);
  if (load.state === 'sample' || load.state === 'loading') return null;
  if (load.state === 'error') return <Notice tone="warning">Quests couldn’t be loaded: {load.message}</Notice>;
  const { quests, newlyCompleted } = load.data;
  const open = quests.filter((q) => q.status === 'active' || q.status === 'ready');
  const done = quests.filter((q) => q.status === 'completed').length;

  return (
    <Panel eyebrow="Quests" title={`${open.length} open · ${done} completed`}>
      {newlyCompleted.length > 0 && (
        <p className="mb-3 flex items-center gap-2 text-gold-200">
          <Trophy className="size-4" aria-hidden />
          {newlyCompleted.length === 1 ? `Quest complete: ${newlyCompleted[0]!.title}` : `${newlyCompleted.length} quests complete`}
          {newlyCompleted.some((q) => q.xp > 0) ? ` (+${newlyCompleted.reduce((n, q) => n + q.xp, 0)} XP)` : ''}
        </p>
      )}
      {open.length === 0 ? (
        <p className="text-ash">{quests.length === 0 ? 'Quests appear as lessons are added.' : 'No open quests right now.'}</p>
      ) : (
        <ul className="space-y-3">
          {open.slice(0, 2).map((q) => {
            const n = q.objectives.filter((o) => o.done).length;
            return (
              <li key={q.key}>
                <p className="text-xs uppercase tracking-wider text-smoke">{questKindLabel[q.kind]}</p>
                <p className="font-serif text-ink">{q.title}</p>
                <ProgressBar className="mt-1.5" value={n} max={q.objectives.length} label={`${q.title} progress`} caption={`${n} of ${q.objectives.length} steps · ${q.xp} XP`} />
              </li>
            );
          })}
        </ul>
      )}
      <ButtonLink to={`/campaigns/${campaignId}/quests`} variant="secondary" className="mt-4">All quests</ButtonLink>
    </Panel>
  );
}
