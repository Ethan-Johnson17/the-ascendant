import type { PlayerData } from '../services/game/playerData.ts';
import { findBackground } from '../content/character/options.ts';

/**
 * ⚠ DEVELOPMENT FIXTURE — NOT REAL PLAYER DATA.
 *
 * A pretend adventurer partway through the History campaign, so the visual design can be judged
 * with non-zero progress before the learning engine exists (Phase 3). The attribute scores and XP
 * below were typed by hand; in the real game they can only come from demonstrated knowledge.
 *
 * Loaded only from "Preview with a sample adventurer". While active, the app shows a "Sample data"
 * banner, keeps all changes in memory, and never sends anything to the database.
 */
const createdAt = '2026-11-01T09:00:00.000Z';

export const samplePlayer: PlayerData = {
  character: {
    id: 'fixture-character',
    name: 'Ninsun of Uruk',
    raceId: 'elf',
    classId: 'wizard',
    backgroundId: 'scholar',
    appearance: { tinctureId: 'azure', description: 'Ink-stained fingers, a scribe’s satchel, and eyes that miss nothing.' },
    personality: {
      ideals: 'What is written endures.',
      bonds: 'The tablet house where I learned my signs.',
      motivation: 'To understand how the first cities rose — and why they fell.',
    },
    attributes: { str: 2, dex: 1, con: 3, int: 6, wis: 4, cha: 2 },
    totalXp: 1500,
    createdAt,
  },
  campaigns: [
    {
      id: 'fixture-campaign-history',
      templateId: 'history-early-civilizations',
      status: 'active',
      campaignXp: 640,
      curriculumVersion: 0,
      startedAt: '2026-11-01T09:05:00.000Z',
      lastPlayedAt: '2026-11-12T18:30:00.000Z',
    },
  ],
  items: (findBackground('scholar')?.startingGear ?? []).map((name, i) => ({
    id: `fixture-item-${i}`,
    itemId: `fixture-item-${i}`,
    name,
    description: '',
    source: 'starting_gear' as const,
    equipped: false,
    acquiredAt: createdAt,
  })),
  achievements: [
    { achievementId: 'character-created', earnedAt: createdAt },
    { achievementId: 'first-campaign', earnedAt: '2026-11-01T09:05:00.000Z' },
  ],
};
