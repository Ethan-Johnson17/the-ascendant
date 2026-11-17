import { useParams } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { useCourses } from '../features/subjects/CoursesProvider.tsx';
import { QuestCard } from '../features/quests/QuestCard.tsx';
import { useQuests } from '../features/quests/useQuests.ts';

export default function QuestsPage() {
  const { campaignId } = useParams();
  const { player } = useGame();
  const campaign = player.campaigns.find((c) => c.id === campaignId);
  const { courseInfo } = useCourses();
  const template = campaign ? courseInfo(campaign.templateId) : null;
  const { load, reload } = useQuests(campaign?.id);

  const header = (subtitle: string) => (
    <PageHeader
      eyebrow={template?.title ?? 'Campaign'}
      title="Quests"
      subtitle={subtitle}
      actions={<ButtonLink to={`/campaigns/${campaignId}`} variant="secondary" icon={<ArrowLeft className="size-4" aria-hidden />}>Campaign</ButtonLink>}
    />
  );

  if (!campaign) return <Notice tone="warning" title="Campaign not found">This campaign isn’t one of yours.</Notice>;
  if (load.state === 'sample') {
    return <div className="space-y-6">{header('Quests')}<Notice title="Sample character">Quests track your real progress, so they need a signed-in account.</Notice></div>;
  }
  if (load.state === 'loading') return <div className="space-y-6">{header('Loading your quests…')}</div>;
  if (load.state === 'error') {
    return (
      <div className="space-y-6">
        {header('Quests')}
        <Notice tone="warning" title="Couldn’t load quests">{load.message}<div className="mt-3"><Button variant="secondary" onClick={() => void reload()}>Try again</Button></div></Notice>
      </div>
    );
  }

  const { quests, newlyCompleted, campaignStatus } = load.data;
  const open = quests.filter((q) => q.status === 'active' || q.status === 'ready');
  const locked = quests.filter((q) => q.status === 'locked');
  const done = quests.filter((q) => q.status === 'completed');
  const active = campaignStatus === 'active';
  const card = (q: (typeof quests)[number]) => <QuestCard key={q.key} quest={q} campaignId={campaign.id} campaignActive={active} onStory={() => {}} />;

  return (
    <div className="space-y-6">
      {header(`${open.length} open · ${done.length} completed`)}
      {newlyCompleted.length > 0 && (
        <Notice title={newlyCompleted.length === 1 ? 'Quest complete' : `${newlyCompleted.length} quests complete`}>
          <ul className="space-y-1">
            {newlyCompleted.map((q) => <li key={q.key} className="flex items-center gap-2"><Trophy className="size-4 text-gold-300" aria-hidden />{q.title}{q.xp > 0 ? ` · +${q.xp} XP` : ''}</li>)}
          </ul>
        </Notice>
      )}
      {!active && <Notice tone="warning">This campaign is paused. Resume it to complete quests and earn their XP.</Notice>}
      {quests.length === 0 && <Notice>This course has no quests yet. Quests appear as its lessons are built.</Notice>}

      {open.length > 0 && <Panel eyebrow="In progress" title="Open quests"><div className="space-y-4">{open.map(card)}</div></Panel>}
      {locked.length > 0 && <Panel eyebrow="Ahead" title="Locked quests"><div className="space-y-4">{locked.map(card)}</div></Panel>}
      {done.length > 0 && <Panel eyebrow="Record" title="Completed quests"><div className="space-y-4">{done.map(card)}</div></Panel>}
    </div>
  );
}
