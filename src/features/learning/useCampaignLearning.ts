import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { RepositoryError } from '../../services/game/gameRepository.ts';
import { loadCampaignLearning, type CampaignLearning } from '../../services/learning/learningData.ts';
import { createLearningClient, type LearningClient } from '../../services/learning/learningClient.ts';
import type { PlayerCampaign } from '../../engine/campaigns/campaigns.ts';

export type LearningLoad = { state: 'loading' } | { state: 'ready'; data: CampaignLearning } | { state: 'error'; message: string } | { state: 'missing' };

/**
 * Loads the learning view for one of the player's campaigns. In sample mode the campaign is a
 * fixture, so only the public lesson content is shown and no progress is read or written.
 */
export function useCampaignLearning(campaignId: string | undefined) {
  const { client } = useAuth();
  const { player, isSample } = useGame();
  const campaign: PlayerCampaign | undefined = player.campaigns.find((c) => c.id === campaignId);
  const [load, setLoad] = useState<LearningLoad>({ state: 'loading' });
  const token = useRef(0);

  const reload = useCallback(async () => {
    const t = ++token.current;
    if (!campaign) return setLoad({ state: 'missing' });
    if (!client) return setLoad({ state: 'error', message: 'The game isn’t connected to its server.' });
    try {
      const data = await loadCampaignLearning(client, isSample ? { id: null, templateId: campaign.templateId } : { id: campaign.id, templateId: campaign.templateId });
      if (t === token.current) setLoad({ state: 'ready', data });
    } catch (err) {
      if (t === token.current) setLoad({ state: 'error', message: err instanceof RepositoryError ? err.message : 'Couldn’t load this campaign’s lessons. Please try again.' });
    }
  }, [campaign, client, isSample]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const api: LearningClient | null = useMemo(() => (client && !isSample ? createLearningClient(client) : null), [client, isSample]);
  return { campaign, load, reload, api, isSample };
}
