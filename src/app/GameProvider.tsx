import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { createCharacter as engineCreateCharacter, type CharacterDraft, type CreateResult } from '../engine/character/createCharacter.ts';
import { setCampaignStatus, startCampaign as engineStartCampaign, touchCampaign } from '../engine/campaigns/campaigns.ts';
import { characterCatalog } from '../content/character/options.ts';
import { findTemplate } from '../content/campaigns/catalog.ts';
import { browserStorage, createSaveStore } from '../services/save/saveStore.ts';
import { emptySave, serializeSave, type SaveFile, type Settings } from '../services/save/saveFile.ts';
import { sampleSave } from '../fixtures/sampleAdventurer.ts';

/**
 * App-wide game state. Screens read state and call actions here; every rule is applied by the
 * engine (src/engine), never inside a component.
 *
 * Sample mode: a clearly labelled fixture save held in memory only. Settings always come from the
 * real save, and nothing done in sample mode is ever written to storage.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

interface GameContextValue {
  save: SaveFile;
  settings: Settings;
  isSample: boolean;
  /** A problem reading or writing the save, shown to the player. */
  storageWarning: string | null;
  createCharacter(draft: CharacterDraft): CreateResult;
  startCampaign(templateId: string): ActionResult;
  pauseCampaign(campaignId: string): ActionResult;
  resumeCampaign(campaignId: string): ActionResult;
  focusCampaign(campaignId: string): ActionResult;
  updateSettings(settings: Partial<Settings>): void;
  enterSample(): void;
  exitSample(): void;
  /** Deletes the real character and all progress on this device. */
  deleteAllData(): void;
  exportSave(): string;
}

const GameContext = createContext<GameContextValue | null>(null);
const store = createSaveStore(browserStorage());

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => store.load());
  const [realSave, setRealSave] = useState<SaveFile>(initial.save);
  const [sample, setSample] = useState<SaveFile | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.warning);

  const commitReal = useCallback((next: SaveFile) => {
    setRealSave(next);
    const written = store.write(next);
    setStorageWarning(written.ok ? null : written.reason);
  }, []);

  /** Applies a change to whichever save is active (sample in memory, or real and persisted). */
  const apply = useCallback(
    (change: (s: SaveFile) => SaveFile) => {
      if (sample) setSample(change(sample));
      else commitReal(change(realSave));
    },
    [sample, realSave, commitReal],
  );

  const active = sample ?? realSave;

  const value = useMemo<GameContextValue>(() => {
    const campaignAction = (fn: (s: SaveFile) => ReturnType<typeof setCampaignStatus>): ActionResult => {
      const result = fn(active);
      if (!result.ok) return { ok: false, error: result.error };
      apply((s) => ({ ...s, campaigns: result.campaigns }));
      return { ok: true };
    };
    return {
      save: { ...active, settings: realSave.settings },
      settings: realSave.settings,
      isSample: sample !== null,
      storageWarning,
      createCharacter(draft) {
        const result = engineCreateCharacter(draft, { id: newId(), now: new Date(), catalog: characterCatalog });
        if (result.ok) {
          // Creating a character always targets the real save and leaves sample mode.
          setSample(null);
          commitReal({ ...realSave, character: result.character });
        }
        return result;
      },
      startCampaign(templateId) {
        const template = findTemplate(templateId);
        if (!template) return { ok: false, error: 'Unknown campaign.' };
        return campaignAction((s) =>
          engineStartCampaign(s.campaigns, { id: newId(), templateId, curriculumVersion: template.curriculumVersion, now: new Date() }),
        );
      },
      pauseCampaign: (id) => campaignAction((s) => setCampaignStatus(s.campaigns, id, 'paused', new Date())),
      resumeCampaign: (id) => campaignAction((s) => setCampaignStatus(s.campaigns, id, 'active', new Date())),
      focusCampaign: (id) => campaignAction((s) => touchCampaign(s.campaigns, id, new Date())),
      updateSettings(patch) {
        commitReal({ ...realSave, settings: { ...realSave.settings, ...patch } });
      },
      enterSample: () => setSample(structuredClone(sampleSave)),
      exitSample: () => setSample(null),
      deleteAllData() {
        setSample(null);
        store.clear();
        commitReal({ ...emptySave, settings: realSave.settings });
      },
      exportSave: () => serializeSave(realSave),
    };
  }, [active, apply, commitReal, realSave, sample, storageWarning]);

  // Motion preference: Framer Motion via MotionConfig, CSS animations via a root attribute.
  useEffect(() => {
    document.documentElement.dataset.motion = realSave.settings.motion;
  }, [realSave.settings.motion]);
  const reducedMotion = realSave.settings.motion === 'reduced' ? 'always' : realSave.settings.motion === 'full' ? 'never' : 'user';

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
