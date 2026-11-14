import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { createCharacter as engineCreateCharacter, type CharacterDraft, type DraftIssue } from '../engine/character/createCharacter.ts';
import { setCampaignStatus, startCampaign as engineStartCampaign, touchCampaign, type CampaignResult } from '../engine/campaigns/campaigns.ts';
import { characterCatalog } from '../content/character/options.ts';
import { findTemplate } from '../content/campaigns/catalog.ts';
import { browserStorage, createSaveStore } from '../services/save/saveStore.ts';
import type { SaveFile, Settings } from '../services/save/saveFile.ts';
import { loadSettings, saveSettings } from '../services/settings/settingsStore.ts';
import { createSupabaseRepository, RepositoryError, type GameRepository } from '../services/game/gameRepository.ts';
import { emptyPlayer, exportPlayer, type PlayerData } from '../services/game/playerData.ts';
import { samplePlayer } from '../fixtures/sampleAdventurer.ts';
import { useAuth } from './AuthProvider.tsx';

/**
 * App-wide game state for the signed-in player, loaded from Supabase.
 *
 * Flow for every action: the engine checks the rule first (so the player gets an instant,
 * specific answer), the database applies it under its own security rules, then the app reloads
 * the player's records so the screen always shows what is really stored.
 *
 * Sample mode: a clearly labelled fixture held in memory only; nothing is sent to the database.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateCharacterResult = { ok: true } | { ok: false; issues: DraftIssue[] };

export type LoadState = { state: 'idle' } | { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/** A character saved in this browser before accounts existed, which can be moved into the account. */
export interface LocalImport {
  readonly characterName: string;
  readonly campaignCount: number;
}

interface GameContextValue {
  player: PlayerData;
  load: LoadState;
  reload(): Promise<void>;
  settings: Settings;
  isSample: boolean;
  /** A problem saving display settings on this device. */
  storageWarning: string | null;
  createCharacter(draft: CharacterDraft): Promise<CreateCharacterResult>;
  startCampaign(templateId: string): Promise<ActionResult>;
  pauseCampaign(campaignId: string): Promise<ActionResult>;
  resumeCampaign(campaignId: string): Promise<ActionResult>;
  focusCampaign(campaignId: string): Promise<ActionResult>;
  updateSettings(settings: Partial<Settings>): void;
  enterSample(): void;
  exitSample(): void;
  /** Deletes the character and every campaign from the account. */
  deleteProgress(): Promise<ActionResult>;
  exportData(): string;
  localImport: LocalImport | null;
  importLocal(): Promise<ActionResult>;
  discardLocal(): void;
}

const GameContext = createContext<GameContextValue | null>(null);
const storage = browserStorage();
const legacyStore = createSaveStore(storage);

const message = (err: unknown) =>
  err instanceof RepositoryError ? err.message : 'Something went wrong talking to the server. Please try again.';

export function GameProvider({ children }: { children: ReactNode }) {
  const { status, client } = useAuth();
  const userId = status.state === 'signed-in' ? status.user.id : null;
  const email = status.state === 'signed-in' ? status.user.email : null;

  const [legacy, setLegacy] = useState<SaveFile | null>(() => {
    const outcome = legacyStore.load();
    return outcome.save.character ? outcome.save : null;
  });
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage, legacy?.settings ?? null));
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerData>(emptyPlayer);
  const [load, setLoad] = useState<LoadState>({ state: 'idle' });
  const [sample, setSample] = useState<PlayerData | null>(null);

  const repo = useMemo<GameRepository | null>(() => (client && userId ? createSupabaseRepository(client) : null), [client, userId]);
  // Ignore results of a load that finished after the player signed out or switched account.
  const loadToken = useRef(0);

  const reload = useCallback(async () => {
    const token = ++loadToken.current;
    if (!repo) {
      setPlayer(emptyPlayer);
      setLoad({ state: 'idle' });
      return;
    }
    try {
      const data = await repo.load();
      if (token !== loadToken.current) return;
      setPlayer(data);
      setLoad({ state: 'ready' });
    } catch (err) {
      if (token !== loadToken.current) return;
      setLoad({ state: 'error', message: message(err) });
    }
  }, [repo]);

  useEffect(() => {
    setPlayer(emptyPlayer);
    setLoad(repo ? { state: 'loading' } : { state: 'idle' });
    void reload();
  }, [repo, reload]);

  // Leaving an account (sign-out) also leaves sample mode, so the next visitor starts clean.
  useEffect(() => {
    if (status.state === 'signed-out') setSample(null);
  }, [status.state]);

  const value = useMemo<GameContextValue>(() => {
    const active = sample ?? player;

    /** Runs a write against the database, then reloads so the screen shows what was stored. */
    const write = async (fn: (r: GameRepository) => Promise<void>): Promise<ActionResult> => {
      if (!repo) return { ok: false, error: 'Please sign in first.' };
      try {
        await fn(repo);
        await reload();
        return { ok: true };
      } catch (err) {
        await reload();
        return { ok: false, error: message(err) };
      }
    };

    /** Checks the engine's rule, then applies it: in memory for the sample, in the database otherwise. */
    const campaignAction = async (rule: (p: PlayerData) => CampaignResult, apply: (r: GameRepository) => Promise<void>): Promise<ActionResult> => {
      const result = rule(active);
      if (!result.ok) return { ok: false, error: result.error };
      if (sample) {
        setSample({ ...sample, campaigns: result.campaigns });
        return { ok: true };
      }
      return write(apply);
    };

    const now = () => new Date();
    const legacyCharacter = legacy?.character ?? null;

    return {
      player: active,
      load: sample ? { state: 'ready' } : load,
      reload,
      settings,
      isSample: sample !== null,
      storageWarning,
      async createCharacter(draft) {
        // The engine validates the draft; the database assigns the id, starting scores and gear.
        const result = engineCreateCharacter(draft, { id: 'pending', now: now(), catalog: characterCatalog });
        if (!result.ok) return result;
        setSample(null);
        const saved = await write((r) => r.createCharacter(result.character));
        return saved.ok ? { ok: true } : { ok: false, issues: [{ field: 'name', message: saved.error }] };
      },
      startCampaign(templateId) {
        const template = findTemplate(templateId);
        if (!template) return Promise.resolve({ ok: false, error: 'Unknown campaign.' });
        return campaignAction(
          (p) => engineStartCampaign(p.campaigns, { id: `new-${templateId}`, templateId, curriculumVersion: template.curriculumVersion, now: now() }),
          (r) => r.startCampaign(templateId),
        );
      },
      pauseCampaign: (id) => campaignAction((p) => setCampaignStatus(p.campaigns, id, 'paused', now()), (r) => r.setCampaignStatus(id, 'paused')),
      resumeCampaign: (id) => campaignAction((p) => setCampaignStatus(p.campaigns, id, 'active', now()), (r) => r.setCampaignStatus(id, 'active')),
      focusCampaign: (id) => campaignAction((p) => touchCampaign(p.campaigns, id, now()), (r) => r.touchCampaign(id)),
      updateSettings(patch) {
        const next = { ...settings, ...patch };
        setSettings(next);
        setStorageWarning(saveSettings(storage, next) ? null : 'This browser is blocking storage, so display settings won’t be remembered.');
      },
      enterSample: () => setSample(structuredClone(samplePlayer)),
      exitSample: () => setSample(null),
      deleteProgress: () => write((r) => r.deleteProgress()),
      exportData: () => exportPlayer(active, { email: sample ? null : email, exportedAt: now() }),
      localImport:
        legacyCharacter && !sample && load.state === 'ready' && player.character === null
          ? { characterName: legacyCharacter.name, campaignCount: legacy?.campaigns.length ?? 0 }
          : null,
      async importLocal() {
        if (!legacy?.character) return { ok: false, error: 'Nothing to import.' };
        const old = legacy;
        const res = await write(async (r) => {
          await r.createCharacter(old.character!);
          // Re-create each campaign; the database stamps new start times.
          for (const c of old.campaigns) {
            await r.startCampaign(c.templateId);
          }
        });
        if (!res.ok) return res;
        // Restore paused state where it was paused before.
        const paused = new Set(old.campaigns.filter((c) => c.status === 'paused').map((c) => c.templateId));
        if (paused.size > 0 && repo) {
          const fresh = await repo.load();
          for (const c of fresh.campaigns) if (paused.has(c.templateId)) await repo.setCampaignStatus(c.id, 'paused');
          await reload();
        }
        legacyStore.clear();
        setLegacy(null);
        return { ok: true };
      },
      discardLocal() {
        legacyStore.clear();
        setLegacy(null);
      },
    };
  }, [email, legacy, load, player, reload, repo, sample, settings, storageWarning]);

  // Motion preference: Framer Motion via MotionConfig, CSS animations via a root attribute.
  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion;
  }, [settings.motion]);
  const reducedMotion = settings.motion === 'reduced' ? 'always' : settings.motion === 'full' ? 'never' : 'user';

  return (
    <GameContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
