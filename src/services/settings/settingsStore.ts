import { z } from 'zod';
import { motionPreferences, type Settings } from '../save/saveFile.ts';
import type { KeyValueStorage } from '../save/saveStore.ts';

/**
 * Display settings are a per-device preference (a phone may want reduced motion while a desktop
 * does not), so they stay in this browser rather than in the account.
 */

export const SETTINGS_KEY = 'the-ascendant:settings';
export const defaultSettings: Settings = { motion: 'system' };

const schema = z.object({ motion: z.enum(motionPreferences) });

/** Reads settings; falls back to the pre-accounts save's settings, then to defaults. */
export function loadSettings(storage: KeyValueStorage | null, legacy: Settings | null): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* unreadable: use the fallback */
  }
  return legacy ?? defaultSettings;
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return storage !== null;
  } catch {
    return false;
  }
}
