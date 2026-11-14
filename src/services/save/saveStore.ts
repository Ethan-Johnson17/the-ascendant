import { emptySave, parseSave, serializeSave, type SaveFile } from './saveFile.ts';

/** Minimal storage surface (matches `window.localStorage`), injectable for tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'the-ascendant:save';
const BACKUP_KEY = 'the-ascendant:save-unreadable-backup';

export interface LoadOutcome {
  readonly save: SaveFile;
  /** Set when stored data could not be read; the original text is kept under a backup key. */
  readonly warning: string | null;
}

export interface SaveStore {
  load(): LoadOutcome;
  write(save: SaveFile): { ok: true } | { ok: false; reason: string };
  clear(): void;
}

export function createSaveStore(storage: KeyValueStorage | null): SaveStore {
  return {
    load() {
      if (!storage) return { save: emptySave, warning: 'This browser is blocking storage, so progress will not be kept.' };
      let raw: string | null;
      try {
        raw = storage.getItem(SAVE_KEY);
      } catch {
        return { save: emptySave, warning: 'This browser is blocking storage, so progress will not be kept.' };
      }
      const result = parseSave(raw);
      if (result.ok) return { save: result.save, warning: null };
      // Never silently destroy a player's data: keep the unreadable copy for recovery.
      try {
        if (raw !== null) storage.setItem(BACKUP_KEY, raw);
      } catch {
        /* storage full; nothing more we can safely do */
      }
      return { save: emptySave, warning: `${result.reason} It was set aside and a fresh save started.` };
    },
    write(save) {
      if (!storage) return { ok: false, reason: 'Storage unavailable.' };
      try {
        storage.setItem(SAVE_KEY, serializeSave(save));
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Could not save. The browser storage may be full or blocked.' };
      }
    },
    clear() {
      try {
        storage?.removeItem(SAVE_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Returns the browser's localStorage, or null where access throws (privacy modes, sandboxes). */
export function browserStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}
