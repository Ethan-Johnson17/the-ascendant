import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveStore, SAVE_KEY, type KeyValueStorage } from './saveStore.ts';
import { emptySave, type SaveFile } from './saveFile.ts';
import { samplePlayer } from '../../fixtures/sampleAdventurer.ts';

// A save in the pre-accounts browser format (still read when importing an old character).
const sampleSave: SaveFile = { version: 1, character: samplePlayer.character, campaigns: samplePlayer.campaigns, settings: { motion: 'system' } };

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('save store', () => {
  it('starts fresh when nothing is stored', () => {
    const out = createSaveStore(memoryStorage()).load();
    assert.deepEqual(out.save, emptySave);
    assert.equal(out.warning, null);
  });

  it('round-trips a full save', () => {
    const storage = memoryStorage();
    const store = createSaveStore(storage);
    assert.ok(store.write(sampleSave).ok);
    const out = store.load();
    assert.equal(out.warning, null);
    assert.deepEqual(out.save, sampleSave);
  });

  it('sets aside corrupt data instead of destroying it', () => {
    const storage = memoryStorage({ [SAVE_KEY]: '{not json' });
    const out = createSaveStore(storage).load();
    assert.deepEqual(out.save, emptySave);
    assert.ok(out.warning);
    assert.equal(storage.data.get('the-ascendant:save-unreadable-backup'), '{not json');
  });

  it('rejects tampered values such as negative XP or attribute 0', () => {
    const bad = structuredClone(sampleSave) as { character: { totalXp: number; attributes: { str: number } } };
    bad.character.totalXp = -5;
    const out = createSaveStore(memoryStorage({ [SAVE_KEY]: JSON.stringify(bad) })).load();
    assert.ok(out.warning);
    const bad2 = structuredClone(sampleSave) as { character: { attributes: { str: number } } };
    bad2.character.attributes.str = 0;
    assert.ok(createSaveStore(memoryStorage({ [SAVE_KEY]: JSON.stringify(bad2) })).load().warning);
  });

  it('rejects saves from an unknown version', () => {
    const future = { ...emptySave, version: 99 } as unknown as SaveFile;
    assert.ok(createSaveStore(memoryStorage({ [SAVE_KEY]: JSON.stringify(future) })).load().warning);
  });

  it('reports blocked storage instead of crashing', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    const store = createSaveStore(throwing);
    assert.ok(store.load().warning);
    assert.equal(store.write(emptySave).ok, false);
    assert.ok(createSaveStore(null).load().warning);
  });
});
