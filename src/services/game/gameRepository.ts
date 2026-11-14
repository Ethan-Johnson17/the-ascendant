import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character } from '../../engine/character/createCharacter.ts';
import type { CampaignStatus } from '../../engine/campaigns/campaigns.ts';
import { characterInsert, parsePlayerRows, type PlayerData } from './playerData.ts';

/**
 * Reads and writes the signed-in player's records in Supabase.
 *
 * The browser may only do what the database's security rules allow (see
 * supabase/migrations/*_core_schema.sql): create and rename a character, start, pause and
 * resume campaigns. Everything engine-owned (attributes, XP, mastery, completion) is read-only
 * here by design.
 */
export interface GameRepository {
  load(): Promise<PlayerData>;
  createCharacter(character: Character): Promise<void>;
  startCampaign(templateId: string): Promise<void>;
  setCampaignStatus(campaignId: string, status: Exclude<CampaignStatus, 'completed'>): Promise<void>;
  touchCampaign(campaignId: string): Promise<void>;
  /** Deletes the character and all progress. The sign-in account itself remains. */
  deleteProgress(): Promise<void>;
}

/** An error whose message is safe and useful to show the player. */
export class RepositoryError extends Error {}

interface PgError {
  code?: string;
  message?: string;
}

export function friendlyDbError(error: PgError): RepositoryError {
  switch (error.code) {
    case '23505':
      return new RepositoryError('That already exists.');
    case '23514':
    case '23503':
      return new RepositoryError('Some of those details aren’t allowed. Please check them and try again.');
    case '42501':
      return new RepositoryError('You don’t have permission to do that.');
    case 'PGRST301':
    case 'PGRST303':
      return new RepositoryError('Your session has expired. Please sign in again.');
  }
  if (/fetch|network/i.test(error.message ?? '')) {
    return new RepositoryError('Couldn’t reach the server. Check your internet connection and try again.');
  }
  return new RepositoryError('Something went wrong talking to the server. Please try again.');
}

function check<T>(result: { data: T; error: PgError | null }): T {
  if (result.error) throw friendlyDbError(result.error);
  return result.data;
}

export function createSupabaseRepository(db: SupabaseClient): GameRepository {
  return {
    async load() {
      const [character, campaigns, items, achievements] = await Promise.all([
        db.from('characters').select('*').maybeSingle(),
        db.from('campaigns').select('*').order('started_at'),
        db.from('character_items').select('id, item_id, source, equipped, acquired_at, items(name, description)').order('acquired_at'),
        db.from('player_achievements').select('achievement_id, earned_at').order('earned_at'),
      ]);
      const parsed = parsePlayerRows({
        character: check(character),
        campaigns: check(campaigns),
        items: check(items),
        achievements: check(achievements),
      });
      if (!parsed.ok) throw new RepositoryError(`${parsed.reason} Please reload; if it keeps happening, the game may need an update.`);
      return parsed.data;
    },
    async createCharacter(character) {
      const res = await db.from('characters').insert(characterInsert(character));
      if (res.error?.code === '23505') throw new RepositoryError('This account already has a character.');
      check(res);
    },
    async startCampaign(templateId) {
      const res = await db.from('campaigns').insert({ template_id: templateId });
      if (res.error?.code === '23505') throw new RepositoryError('You have already begun this campaign.');
      check(res);
    },
    async setCampaignStatus(campaignId, status) {
      check(await db.from('campaigns').update({ status }).eq('id', campaignId));
    },
    async touchCampaign(campaignId) {
      // The database stamps the time itself; any update marks the campaign as just played.
      check(await db.from('campaigns').update({ last_played_at: new Date().toISOString() }).eq('id', campaignId));
    },
    async deleteProgress() {
      check(await db.rpc('delete_my_progress'));
    },
  };
}
