import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { createLearningClient, type QuestList } from '../../services/learning/learningClient.ts';

export type QuestLoad = { state: 'loading' } | { state: 'ready'; data: QuestList } | { state: 'error'; message: string } | { state: 'sample' };

/**
 * Loads a campaign's quests from the server. The server completes any quest whose objectives the
 * player has just met (with its one-time XP), so the player's totals are reloaded when that happens.
 */
export function useQuests(campaignId: string | undefined) {
  const { client } = useAuth();
  const game = useGame();
  const api = useMemo(() => (client && !game.isSample ? createLearningClient(client) : null), [client, game.isSample]);
  const [load, setLoad] = useState<QuestLoad>({ state: 'loading' });
  const token = useRef(0);
  const reloadGame = game.reload;

  const reload = useCallback(async () => {
    const t = ++token.current;
    if (game.isSample) return setLoad({ state: 'sample' });
    if (!api || !campaignId) return setLoad({ state: 'error', message: 'The game isn’t connected to its server.' });
    const r = await api.listQuests(campaignId);
    if (t !== token.current) return;
    setLoad(r.ok ? { state: 'ready', data: r.data } : { state: 'error', message: r.error });
    if (r.ok && r.data.newlyCompleted.some((q) => q.xp > 0)) void reloadGame();
  }, [api, campaignId, game.isSample, reloadGame]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { load, reload };
}

/** The route for an activity id ('<template>/<key>'). */
export const activityKey = (activityId: string) => activityId.slice(activityId.indexOf('/') + 1);
