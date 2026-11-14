import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, saveSettings, SETTINGS_KEY } from './settingsStore.ts';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('settings store', () => {
  it('round-trips settings', () => {
    const s = memory();
    assert.equal(saveSettings(s, { motion: 'reduced' }), true);
    assert.deepEqual(loadSettings(s, null), { motion: 'reduced' });
  });

  it('falls back to the old save’s settings, then defaults, when nothing valid is stored', () => {
    assert.deepEqual(loadSettings(memory(), { motion: 'full' }), { motion: 'full' });
    assert.deepEqual(loadSettings(memory({ [SETTINGS_KEY]: '{"motion":"wild"}' }), null), defaultSettings);
    assert.deepEqual(loadSettings(memory({ [SETTINGS_KEY]: 'not json' }), null), defaultSettings);
    assert.deepEqual(loadSettings(null, null), defaultSettings);
  });
});
