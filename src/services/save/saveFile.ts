import { z } from 'zod';
import { attributeIds } from '../../engine/character/attributes.ts';
import { campaignStatuses } from '../../engine/campaigns/campaigns.ts';
import type { Character } from '../../engine/character/createCharacter.ts';
import type { PlayerCampaign } from '../../engine/campaigns/campaigns.ts';

/**
 * The player's save, as stored on this device.
 *
 * PHASE 1 STORAGE: until accounts and the database arrive in Phase 2, the save lives in the
 * browser's localStorage. The UI says so. Phase 2 swaps the storage behind `SaveStore` for
 * Supabase; screens do not change. Everything read back is validated, because stored data
 * can be stale, edited or corrupt.
 */

export const SAVE_VERSION = 1;

export const motionPreferences = ['system', 'reduced', 'full'] as const;
export type MotionPreference = (typeof motionPreferences)[number];

export interface Settings {
  readonly motion: MotionPreference;
}

export interface SaveFile {
  readonly version: typeof SAVE_VERSION;
  readonly character: Character | null;
  readonly campaigns: readonly PlayerCampaign[];
  readonly settings: Settings;
}

export const emptySave: SaveFile = {
  version: SAVE_VERSION,
  character: null,
  campaigns: [],
  settings: { motion: 'system' },
};

const score = z.number().int().min(1).max(100);
const text = z.string().max(2000);
const isoDate = z.iso.datetime();

const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  raceId: z.string().min(1),
  classId: z.string().min(1),
  backgroundId: z.string().min(1),
  appearance: z.object({ tinctureId: z.string().min(1), description: text }),
  personality: z.object({ ideals: text, bonds: text, motivation: text }),
  attributes: z.object(Object.fromEntries(attributeIds.map((id) => [id, score])) as Record<(typeof attributeIds)[number], typeof score>),
  totalXp: z.number().int().min(0),
  createdAt: isoDate,
});

const campaignSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  status: z.enum(campaignStatuses),
  campaignXp: z.number().int().min(0),
  curriculumVersion: z.number().int().min(0),
  startedAt: isoDate,
  lastPlayedAt: isoDate,
});

const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  character: characterSchema.nullable(),
  campaigns: z.array(campaignSchema),
  settings: z.object({ motion: z.enum(motionPreferences) }),
});

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; reason: string };

/** Parses stored text. Missing data is a fresh start; anything malformed is reported, never guessed. */
export function parseSave(raw: string | null): ParseResult {
  if (raw === null || raw === '') return { ok: true, save: emptySave };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'The saved data is not readable.' };
  }
  const parsed = saveSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'The saved data does not match this version of the game.' };
  return { ok: true, save: parsed.data };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}
