import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { createLearningClient, type BossList } from '../../services/learning/learningClient.ts';

export type BossLoad = { state: 'loading' } | { state: 'ready'; data: BossList } | { state: 'error'; message: string } | { state: 'sample' };

/** Loads each boss's status for one campaign. The server (engine) decides every status. */
export function useBosses(campaignId: string | undefined) {
  const { client } = useAuth();
  const game = useGame();
  const api = useMemo(() => (client && !game.isSample ? createLearningClient(client) : null), [client, game.isSample]);
  const [load, setLoad] = useState<BossLoad>({ state: 'loading' });
  const token = useRef(0);

  const reload = useCallback(async () => {
    const t = ++token.current;
    if (game.isSample) return setLoad({ state: 'sample' });
    if (!api || !campaignId) return setLoad({ state: 'error', message: 'The game isn’t connected to its server.' });
    const r = await api.listBosses(campaignId);
    if (t !== token.current) return;
    setLoad(r.ok ? { state: 'ready', data: r.data } : { state: 'error', message: r.error });
  }, [api, campaignId, game.isSample]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { load, reload, api };
}

export const bossStageName = (stage: number) => ['', 'Novice', 'Apprentice', 'Competent', 'Proficient', 'Advanced', 'Expert'][stage] ?? '';
