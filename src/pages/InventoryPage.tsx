import { Backpack, Gift, Package } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { findBackground } from '../content/character/options.ts';

export default function InventoryPage() {
  const { player } = useGame();
  const character = player.character;
  if (!character) return null; // guarded by the router
  const background = findBackground(character.backgroundId);

  return (
    <div>
      <PageHeader eyebrow="Inventory" title="Your belongings" subtitle="Gear you carry on your adventures. Rewards from quests and bosses will appear here too." />
      <Notice className="mb-6">Items have no effect in encounters yet. Equipment gains its powers when boss encounters arrive in Phase 5.</Notice>

      {player.items.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center py-8 text-center">
            <Package className="size-8 text-smoke" aria-hidden />
            <p className="mt-3 text-ash">Your pack is empty.</p>
          </div>
        </Panel>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {player.items.map((item) => (
            <li key={item.id}>
              <Panel as="article" className="h-full">
                <div className="flex gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold-600 bg-gold-600/15 text-gold-300">
                    {item.source === 'reward' ? <Gift className="size-5" aria-hidden /> : <Backpack className="size-5" aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold text-gold-100">{item.name}</h2>
                    {item.description && <p className="mt-1 text-sm text-ash">{item.description}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone={item.source === 'reward' ? 'gold' : 'neutral'}>
                        {item.source === 'reward' ? 'Reward' : `Starting gear${background ? ` · ${background.name}` : ''}`}
                      </Badge>
                      <span className="text-xs text-smoke">
                        Since {new Date(item.acquiredAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </span>
                    </div>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
