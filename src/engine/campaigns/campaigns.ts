/**
 * Campaign lifecycle rules (GAME_DESIGN.md §4): a player may run several campaigns at once,
 * pause and resume them freely, and progress in one never touches another.
 *
 * Pure functions over an immutable list. Campaign XP/level are caches of the (Phase 2) ledger.
 */

export const campaignStatuses = ['active', 'paused', 'completed'] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export interface PlayerCampaign {
  readonly id: string;
  /** The authored or generated campaign template this run is based on. */
  readonly templateId: string;
  readonly status: CampaignStatus;
  readonly campaignXp: number;
  readonly curriculumVersion: number;
  readonly startedAt: string;
  /** Last time the player opened or changed this campaign; drives "continue where you left off". */
  readonly lastPlayedAt: string;
}

export type CampaignResult =
  | { ok: true; campaigns: readonly PlayerCampaign[]; campaign: PlayerCampaign }
  | { ok: false; error: string };

export function startCampaign(
  campaigns: readonly PlayerCampaign[],
  input: { id: string; templateId: string; curriculumVersion: number; now: Date },
): CampaignResult {
  if (campaigns.some((c) => c.templateId === input.templateId)) {
    return { ok: false, error: 'You have already begun this campaign.' };
  }
  if (campaigns.some((c) => c.id === input.id)) return { ok: false, error: 'Duplicate campaign id.' };
  const at = input.now.toISOString();
  const campaign: PlayerCampaign = {
    id: input.id,
    templateId: input.templateId,
    status: 'active',
    campaignXp: 0,
    curriculumVersion: input.curriculumVersion,
    startedAt: at,
    lastPlayedAt: at,
  };
  return { ok: true, campaigns: [...campaigns, campaign], campaign };
}

const allowed: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  active: ['paused'],
  paused: ['active'],
  // Completion is granted by the engine when the final boss falls (Phase 5), never by a toggle.
  completed: [],
};

export function setCampaignStatus(
  campaigns: readonly PlayerCampaign[],
  campaignId: string,
  status: Exclude<CampaignStatus, 'completed'>,
  now: Date,
): CampaignResult {
  const current = campaigns.find((c) => c.id === campaignId);
  if (!current) return { ok: false, error: 'Campaign not found.' };
  if (!allowed[current.status].includes(status)) {
    return { ok: false, error: `A ${current.status} campaign cannot become ${status}.` };
  }
  const updated: PlayerCampaign = { ...current, status, lastPlayedAt: now.toISOString() };
  return { ok: true, campaigns: campaigns.map((c) => (c.id === campaignId ? updated : c)), campaign: updated };
}

/** Marks a campaign as the one the player is focused on, without changing its status. */
export function touchCampaign(campaigns: readonly PlayerCampaign[], campaignId: string, now: Date): CampaignResult {
  const current = campaigns.find((c) => c.id === campaignId);
  if (!current) return { ok: false, error: 'Campaign not found.' };
  const updated: PlayerCampaign = { ...current, lastPlayedAt: now.toISOString() };
  return { ok: true, campaigns: campaigns.map((c) => (c.id === campaignId ? updated : c)), campaign: updated };
}

/** The active campaign played most recently, or null. */
export function currentCampaign(campaigns: readonly PlayerCampaign[]): PlayerCampaign | null {
  const active = campaigns.filter((c) => c.status === 'active');
  if (active.length === 0) return null;
  return active.reduce((a, b) => (b.lastPlayedAt > a.lastPlayedAt ? b : a));
}
