import { z } from 'zod';
import type { Character } from '../../engine/character/createCharacter.ts';
import { campaignStatuses, type PlayerCampaign } from '../../engine/campaigns/campaigns.ts';

/**
 * Everything the app knows about one player, as loaded from the database.
 *
 * Rows coming back from Supabase are validated here before they reach the game: a schema
 * change or bad row produces a readable error instead of a broken screen.
 */

export interface OwnedItem {
  readonly id: string;
  readonly itemId: string;
  readonly name: string;
  readonly description: string;
  readonly source: 'starting_gear' | 'reward';
  readonly equipped: boolean;
  readonly acquiredAt: string;
}

export interface EarnedAchievement {
  readonly achievementId: string;
  readonly earnedAt: string;
}

export interface PlayerData {
  readonly character: Character | null;
  readonly campaigns: readonly PlayerCampaign[];
  readonly items: readonly OwnedItem[];
  readonly achievements: readonly EarnedAchievement[];
}

export const emptyPlayer: PlayerData = { character: null, campaigns: [], items: [], achievements: [] };

// Postgres returns timestamps like 2026-11-14T10:00:00.123456+00:00; store them as plain ISO.
const timestamp = z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString());
const score = z.number().int().min(1).max(20);

const characterRow = z.object({
  id: z.string().min(1),
  name: z.string(),
  race_id: z.string(),
  class_id: z.string(),
  background_id: z.string(),
  tincture_id: z.string(),
  appearance_description: z.string(),
  ideals: z.string(),
  bonds: z.string(),
  motivation: z.string(),
  strength: score,
  dexterity: score,
  constitution: score,
  intelligence: score,
  wisdom: score,
  charisma: score,
  total_xp: z.number().int().min(0),
  created_at: timestamp,
});

const campaignRow = z.object({
  id: z.string().min(1),
  template_id: z.string(),
  status: z.enum(campaignStatuses),
  campaign_xp: z.number().int().min(0),
  curriculum_version: z.number().int().min(0),
  started_at: timestamp,
  last_played_at: timestamp,
});

const itemRow = z.object({
  id: z.string().min(1),
  item_id: z.string(),
  source: z.enum(['starting_gear', 'reward']),
  equipped: z.boolean(),
  acquired_at: timestamp,
  items: z.object({ name: z.string(), description: z.string() }),
});

const achievementRow = z.object({ achievement_id: z.string(), earned_at: timestamp });

export interface PlayerRows {
  character: unknown;
  campaigns: unknown;
  items: unknown;
  achievements: unknown;
}

export type PlayerParse = { ok: true; data: PlayerData } | { ok: false; reason: string };

export function parsePlayerRows(rows: PlayerRows): PlayerParse {
  const character = characterRow.nullable().safeParse(rows.character ?? null);
  const campaigns = z.array(campaignRow).safeParse(rows.campaigns);
  const items = z.array(itemRow).safeParse(rows.items);
  const achievements = z.array(achievementRow).safeParse(rows.achievements);
  const failed = [
    ['character', character],
    ['campaigns', campaigns],
    ['items', items],
    ['achievements', achievements],
  ].find(([, r]) => !(r as { success: boolean }).success);
  if (failed || !character.success || !campaigns.success || !items.success || !achievements.success) {
    return { ok: false, reason: `Your ${failed?.[0] as string} data came back in an unexpected shape.` };
  }
  const c = character.data;
  return {
    ok: true,
    data: {
      character: c && {
        id: c.id,
        name: c.name,
        raceId: c.race_id,
        classId: c.class_id,
        backgroundId: c.background_id,
        appearance: { tinctureId: c.tincture_id, description: c.appearance_description },
        personality: { ideals: c.ideals, bonds: c.bonds, motivation: c.motivation },
        attributes: { str: c.strength, dex: c.dexterity, con: c.constitution, int: c.intelligence, wis: c.wisdom, cha: c.charisma },
        totalXp: c.total_xp,
        createdAt: c.created_at,
      },
      campaigns: campaigns.data.map((r) => ({
        id: r.id,
        templateId: r.template_id,
        status: r.status,
        campaignXp: r.campaign_xp,
        curriculumVersion: r.curriculum_version,
        startedAt: r.started_at,
        lastPlayedAt: r.last_played_at,
      })),
      items: items.data.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        name: r.items.name,
        description: r.items.description,
        source: r.source,
        equipped: r.equipped,
        acquiredAt: r.acquired_at,
      })),
      achievements: achievements.data.map((r) => ({ achievementId: r.achievement_id, earnedAt: r.earned_at })),
    },
  };
}

/**
 * The only character fields a player may send. Attributes, XP and ids are set by the database
 * (and later the engine); sending them would be refused anyway.
 */
export function characterInsert(c: Character) {
  return {
    name: c.name,
    race_id: c.raceId,
    class_id: c.classId,
    background_id: c.backgroundId,
    tincture_id: c.appearance.tinctureId,
    appearance_description: c.appearance.description,
    ideals: c.personality.ideals,
    bonds: c.personality.bonds,
    motivation: c.personality.motivation,
  };
}

/** A downloadable copy of everything stored about the player. */
export function exportPlayer(data: PlayerData, meta: { email: string | null; exportedAt: Date }): string {
  return JSON.stringify(
    { format: 'the-ascendant-export', version: 1, exportedAt: meta.exportedAt.toISOString(), account: { email: meta.email }, ...data },
    null,
    2,
  );
}
