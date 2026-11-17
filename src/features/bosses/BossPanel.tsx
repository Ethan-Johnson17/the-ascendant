import { Check, Lock, ShieldAlert, Swords } from 'lucide-react';
import { Panel } from '../../components/ui/Panel.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { ButtonLink } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import type { BossStatusView } from '../../services/learning/learningClient.ts';
import { bossStageName, useBosses } from './useBosses.ts';

/** The campaign page's bosses: one per stage gate, with what the player must do next. */
export function BossPanel({ campaignId }: { campaignId: string }) {
  const { load } = useBosses(campaignId);
  if (load.state === 'sample' || load.state === 'loading') return null;
  if (load.state === 'error') return <Notice tone="warning">Bosses couldn’t be loaded: {load.message}</Notice>;
  const { bosses, campaignStatus } = load.data;
  if (bosses.length === 0) return null;

  return (
    <Panel eyebrow="Boss encounters" title="Stage gates">
      <p className="mb-3 text-sm text-ash">Each boss tests every skill at its stage. Beating it opens the next stage’s checks.</p>
      <ul className="space-y-3">
        {bosses.map((b) => <BossRow key={b.stage} boss={b} campaignId={campaignId} paused={campaignStatus !== 'active'} />)}
      </ul>
    </Panel>
  );
}

function BossRow({ boss: b, campaignId, paused }: { boss: BossStatusView; campaignId: string; paused: boolean }) {
  const name = bossStageName(b.stage);
  const to = `/campaigns/${campaignId}/boss/${b.stage}`;
  return (
    <li className="rounded-control border border-iron bg-charcoal/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-serif text-lg text-ink">The {name} boss</span>
        {b.status === 'won' && <Badge tone="vital"><Check className="size-3" aria-hidden />Beaten</Badge>}
        {b.status === 'active' && <Badge tone="ember"><Swords className="size-3" aria-hidden />Battle under way</Badge>}
        {b.status === 'ready' && <Badge tone="gold"><Swords className="size-3" aria-hidden />Ready</Badge>}
        {b.status === 'locked' && <Badge><Lock className="size-3" aria-hidden />Locked</Badge>}
        {b.status === 'recover' && <Badge tone="warning"><ShieldAlert className="size-3" aria-hidden />Recover first</Badge>}
      </div>
      {b.status === 'won' && <p className="mt-1 text-sm text-ash">{b.stage < 4 ? `The ${bossStageName(b.stage + 1)} checks are open.` : 'The Advanced checks are open.'}</p>}
      {b.status === 'locked' && <p className="mt-1 text-sm text-ash">{b.reason}</p>}
      {b.status === 'recover' && (
        <p className="mt-1 text-sm text-ash">
          Pass again a check on {b.recovery.steps.filter((s) => !s.done).length === 1 ? 'one concept' : `${b.recovery.steps.filter((s) => !s.done).length} concepts`} you missed, then try again.
        </p>
      )}
      {b.status === 'ready' && <p className="mt-1 text-sm text-ash">{paused ? 'Resume this campaign to face it.' : 'Every skill is ready. Each mistake costs Resolve.'}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {b.status === 'ready' && !paused && <ButtonLink to={to} icon={<Swords className="size-4" aria-hidden />}>Face the boss</ButtonLink>}
        {b.status === 'active' && <ButtonLink to={to} icon={<Swords className="size-4" aria-hidden />}>Resume the battle</ButtonLink>}
        {b.status === 'recover' && <ButtonLink to={`/campaigns/${campaignId}/quests`} variant="secondary">See the recovery quest</ButtonLink>}
      </div>
    </li>
  );
}
